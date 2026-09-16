/**
 * Unwinding a sale.
 *
 * `unwindPaidInvoice` — a paid invoice is refunded (Stripe `charge.refunded`
 * webhook, or an admin recording a wire/check refund). One code path for
 * both so the side effects can never drift:
 *   (a) release the lot (relist to gallery at reserve/low estimate, else
 *       `unsold`) via the same helper the auction cron uses,
 *   (b) cancel the pending payout / reverse an already-paid one,
 *   (c) cancel shipments that have not left the seller,
 *   (d) email the buyer,
 *   (e) revalidate the public catalogue.
 *
 * (a)–(c) commit together with the invoice status flip in ONE transaction.
 * Before this they ran one after another outside any transaction, each
 * swallowing its own error — a hiccup after the flip left the invoice
 * `refunded` while the lot stayed `sold` and the shipment stayed open, and
 * because the flip is a compare-and-swap, a redelivered webhook could never
 * retry it. Now a failure anywhere rolls the flip back and the next delivery
 * (or admin click) runs the whole unwind again.
 *
 * `cancelPendingInvoice` — an unpaid invoice is voided by an admin: expire
 * the open Checkout session so the buyer can't pay a dead invoice, and
 * release the lot the same way (also atomically with the flip).
 */

import { db } from '@/db';
import { invoices, lots, shipments, auctions, users } from '@/db/schema';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { relistUnsoldLot, type Executor } from '@/lib/lots/relist';
import { cancelPayoutForRefundedInvoice } from '@/lib/payouts/service';
import { OPEN_SHIPMENT_STATUSES, IN_FLIGHT_SHIPMENT_STATUSES } from '@/lib/shipping/transitions';
import { stripe } from '@/lib/stripe/config';
import { sendInvoiceRefundedNotification } from '@/lib/email/notifications';
import { isSentinelEmail } from '@/lib/sellers/sentinel';
import { revalidatePublicCatalog } from '@/lib/revalidate';
import { logger } from '@/lib/logger';

export type LotRelease = 'relisted' | 'returned' | 'left';

export interface UnwindResult {
  unwound: boolean;
  /** Invoice status after the call. */
  status: string;
  lot: LotRelease | null;
  payout: 'cancelled' | 'reversed' | 'none' | null;
  shipmentsCancelled: number;
  shipmentsInFlight: number;
}

/** "YYYY-MM-DD Prefix: reason" — the one-line-per-event format used in invoice/shipment notes. */
export function stampNote(prefix: string, reason: string): string {
  return `${new Date().toISOString().slice(0, 10)} ${prefix}: ${reason}`;
}

/**
 * Expire an open Checkout session so a dead invoice can no longer be paid.
 * Best-effort: a completed/expired session (or a Stripe outage) is ignored.
 */
export async function expireCheckoutSession(sessionId: string | null | undefined, invoiceId: string) {
  if (!sessionId) return;
  try {
    await stripe.checkout.sessions.expire(sessionId, undefined, {
      idempotencyKey: `expire:${sessionId}`,
    });
  } catch (err) {
    logger.info('Checkout session not expired (already complete/expired, or Stripe error) — ignored', {
      invoiceId,
      sessionId,
      err: String(err),
    });
  }
}

/**
 * Put the lot back on the market. Guarded so a lot that has since been
 * re-auctioned or re-sold to someone else is never touched. Locks the lot
 * row so a concurrent settlement/withdrawal can't interleave.
 */
async function releaseLotForInvoice(
  tx: Executor,
  invoice: { id: string; lotId: string; buyerId: string },
  now: Date,
): Promise<LotRelease> {
  const [lot] = await tx.select().from(lots).where(eq(lots.id, invoice.lotId)).for('update');
  if (!lot) return 'left';
  if (lot.status !== 'sold' || (lot.winnerId && lot.winnerId !== invoice.buyerId)) {
    logger.warn('Unwind: lot not released — it is no longer this buyer\'s sold lot', {
      invoiceId: invoice.id,
      lotId: lot.id,
      lotStatus: lot.status,
      winnerId: lot.winnerId,
    });
    return 'left';
  }
  return relistUnsoldLot(lot, now, tx);
}

async function auctionSlugFor(auctionId: string | null): Promise<string | null> {
  if (!auctionId) return null;
  const [auction] = await db.select({ slug: auctions.slug }).from(auctions).where(eq(auctions.id, auctionId)).limit(1);
  return auction?.slug ?? null;
}

type RefundedInvoice = typeof invoices.$inferSelect;

/** Control-flow marker for "the caller asked us not to email the buyer". */
class SkipBuyerEmail extends Error {}

export interface UnwindOptions {
  /**
   * Email the buyer that we refunded them. False when the money left by
   * another route — a lost chargeback already moved the funds back, so
   * telling the buyer "we've issued a refund" would invite them to chase a
   * second one that will never come.
   */
  notifyBuyer?: boolean;
}

export async function unwindPaidInvoice(
  invoiceId: string,
  reason: string,
  options: UnwindOptions = {},
): Promise<UnwindResult> {
  const { notifyBuyer = true } = options;
  const now = new Date();

  const outcome = await db.transaction(async (tx) => {
    // Only a paid invoice can be refunded — never overwrite cancelled/other
    // terminal states, and make a redelivered webhook a no-op.
    const [refunded] = await tx
      .update(invoices)
      .set({
        status: 'refunded',
        notes: sql`concat_ws(chr(10), ${invoices.notes}, ${stampNote('Refunded', reason)})`,
        updatedAt: now,
      })
      .where(and(eq(invoices.id, invoiceId), eq(invoices.status, 'paid')))
      .returning();

    if (!refunded) return null;

    // (a) Release the lot
    const lot = await releaseLotForInvoice(tx, refunded, now);

    // (b) Payout — inside the transaction it throws on failure so the flip rolls back
    const payout = await cancelPayoutForRefundedInvoice(invoiceId, reason, tx);

    // (c) Shipments
    const cancelled = await tx
      .update(shipments)
      .set({
        status: 'cancelled',
        internalNotes: sql`concat_ws(chr(10), ${shipments.internalNotes}, ${stampNote('Cancelled', `sale unwound — ${reason}`)})`,
        updatedAt: now,
      })
      .where(and(eq(shipments.invoiceId, invoiceId), inArray(shipments.status, [...OPEN_SHIPMENT_STATUSES])))
      .returning({ id: shipments.id });

    const inFlight = await tx
      .update(shipments)
      .set({
        internalNotes: sql`concat_ws(chr(10), ${shipments.internalNotes}, ${stampNote('ATTENTION', `sale refunded while shipment is in transit — recall/return required (${reason})`)})`,
        updatedAt: now,
      })
      .where(and(eq(shipments.invoiceId, invoiceId), inArray(shipments.status, [...IN_FLIGHT_SHIPMENT_STATUSES])))
      .returning({ id: shipments.id, status: shipments.status });

    return { refunded: refunded as RefundedInvoice, lot, payout, cancelled: cancelled.length, inFlight };
  });

  if (!outcome) {
    const [current] = await db.select({ status: invoices.status }).from(invoices).where(eq(invoices.id, invoiceId)).limit(1);
    return {
      unwound: false,
      status: current?.status ?? 'missing',
      lot: null,
      payout: null,
      shipmentsCancelled: 0,
      shipmentsInFlight: 0,
    };
  }

  const { refunded, inFlight } = outcome;
  const result: UnwindResult = {
    unwound: true,
    status: 'refunded',
    lot: outcome.lot,
    payout: outcome.payout,
    shipmentsCancelled: outcome.cancelled,
    shipmentsInFlight: inFlight.length,
  };

  if (inFlight.length > 0) {
    logger.error('REFUND on an invoice whose shipment is already in transit — manual recall required', undefined, {
      invoiceId,
      shipments: inFlight,
    });
  }

  // Everything below is best-effort and happens AFTER the commit.

  // A refunded invoice can't be paid again either.
  await expireCheckoutSession(refunded.stripeCheckoutSessionId, invoiceId);

  // (d) Buyer email
  try {
    if (!notifyBuyer) throw new SkipBuyerEmail();
    const [row] = await db
      .select({ email: users.email, lotTitle: lots.title })
      .from(users)
      .innerJoin(lots, eq(lots.id, refunded.lotId))
      .where(eq(users.id, refunded.buyerId))
      .limit(1);
    if (row?.email && !isSentinelEmail(row.email)) {
      await sendInvoiceRefundedNotification({
        email: row.email,
        lotTitle: row.lotTitle,
        invoiceNumber: refunded.invoiceNumber,
        totalAmount: refunded.totalAmount,
      });
    }
  } catch (err) {
    if (!(err instanceof SkipBuyerEmail)) {
      logger.error('Unwind: buyer refund email failed', err, { invoiceId });
    }
  }

  // (e) Catalogue
  revalidatePublicCatalog(await auctionSlugFor(refunded.auctionId));

  logger.info('Paid invoice unwound', { invoiceId, reason, ...result });
  return result;
}

export interface CancelResult {
  cancelled: boolean;
  status: string;
  lot: LotRelease | null;
}

export async function cancelPendingInvoice(invoiceId: string, reason: string): Promise<CancelResult> {
  const now = new Date();

  const outcome = await db.transaction(async (tx) => {
    const [cancelled] = await tx
      .update(invoices)
      .set({
        status: 'cancelled',
        notes: sql`concat_ws(chr(10), ${invoices.notes}, ${stampNote('Cancelled', reason)})`,
        updatedAt: now,
      })
      .where(and(eq(invoices.id, invoiceId), inArray(invoices.status, ['pending', 'overdue'])))
      .returning();

    if (!cancelled) return null;
    const lot = await releaseLotForInvoice(tx, cancelled, now);
    return { cancelled: cancelled as RefundedInvoice, lot };
  });

  if (!outcome) {
    const [current] = await db.select({ status: invoices.status }).from(invoices).where(eq(invoices.id, invoiceId)).limit(1);
    return { cancelled: false, status: current?.status ?? 'missing', lot: null };
  }

  // The buyer must not be able to pay a voided invoice through a session that
  // is still open in another tab.
  await expireCheckoutSession(outcome.cancelled.stripeCheckoutSessionId, invoiceId);

  revalidatePublicCatalog(await auctionSlugFor(outcome.cancelled.auctionId));

  logger.info('Pending invoice cancelled', { invoiceId, reason, lot: outcome.lot });
  return { cancelled: true, status: 'cancelled', lot: outcome.lot };
}
