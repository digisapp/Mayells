/**
 * Seller-side settlement for a paid invoice: record the payout we owe the
 * consignor, kick off the shipment, and send the seller their statement.
 *
 * Called from the Stripe payment-intent handler and the admin manual
 * mark-paid path. Every step is individually guarded and idempotent (payout:
 * partial-unique on lot; shipment: existence check; statement:
 * statement_sent_at stamp) so webhook redeliveries and admin replays can
 * safely re-run it — and a step that failed mid-way self-heals on the next
 * delivery. It never throws: seller-side failures must not fail the buyer's
 * payment webhook.
 */

import { db } from '@/db';
import {
  payouts,
  consignments,
  sellerProspects,
  uploadItems,
  shipments,
  automationSettings,
  type Payout,
} from '@/db/schema';
import { eq, and, ne, notInArray, isNotNull, isNull, desc, sql } from 'drizzle-orm';
import type { Executor } from '@/lib/lots/relist';
import { resolveCommission, computePayoutAmounts } from './commission';
import { createShipmentForInvoice } from '@/lib/shipping/service';
import { sendSellerStatementNotification, sendPaymentConfirmation } from '@/lib/email/notifications';
import { isSentinelEmail } from '@/lib/sellers/shadow';
import { portalUrl } from '@/lib/sellers/portal';
import { logger } from '@/lib/logger';

/** Payout statuses that still represent money owed / paid for a live sale. */
export const DEAD_PAYOUT_STATUSES = ['cancelled', 'reversed'] as const;

export async function processPaidInvoice(
  invoiceId: string,
  opts: { sendBuyerConfirmation?: boolean } = {},
): Promise<void> {
  let invoice: Awaited<ReturnType<typeof loadInvoice>>;
  try {
    invoice = await loadInvoice(invoiceId);
  } catch (err) {
    logger.error('Paid-invoice settlement: could not load invoice', err, { invoiceId });
    return;
  }
  if (!invoice) {
    logger.warn('Paid-invoice settlement: invoice not found', { invoiceId });
    return;
  }

  const settings = await getSettings();

  let payout: Payout | null = null;
  try {
    payout = await ensurePayoutForInvoice(invoice);
  } catch (err) {
    logger.error('Paid-invoice settlement: payout creation failed', err, { invoiceId });
  }

  try {
    if (payout) await sendStatementIfNeeded(payout, invoice.lot.title, settings?.notifySellerOnSale ?? true);
  } catch (err) {
    logger.error('Paid-invoice settlement: seller statement failed', err, { invoiceId });
  }

  try {
    if (settings?.autoCreateShipment ?? true) {
      // Only a returned-to-sender shipment may be re-attempted. A cancelled one
      // stays as the record for this invoice — otherwise a benign webhook
      // redelivery would resurrect a shipment an admin deliberately cancelled
      // (and email the seller again). Matches the partial unique index.
      const [existing] = await db
        .select({ id: shipments.id })
        .from(shipments)
        .where(and(eq(shipments.invoiceId, invoiceId), ne(shipments.status, 'returned')))
        .limit(1);
      if (!existing) await createShipmentForInvoice(invoiceId);
    }
  } catch (err) {
    logger.error('Paid-invoice settlement: shipment creation failed', err, { invoiceId });
  }

  try {
    if (opts.sendBuyerConfirmation && invoice.buyer?.email && !isSentinelEmail(invoice.buyer.email)) {
      await sendPaymentConfirmation({
        email: invoice.buyer.email,
        lotTitle: invoice.lot.title,
        invoiceNumber: invoice.invoiceNumber,
        totalAmount: invoice.totalAmount,
      });
    }
  } catch (err) {
    logger.error('Paid-invoice settlement: buyer payment confirmation failed', err, { invoiceId });
  }
}

async function loadInvoice(invoiceId: string) {
  return db.query.invoices.findFirst({
    where: (inv, { eq: eqOp }) => eqOp(inv.id, invoiceId),
    with: { lot: true, buyer: true },
  });
}

type LoadedInvoice = NonNullable<Awaited<ReturnType<typeof loadInvoice>>>;

async function getSettings() {
  const [settings] = await db.select().from(automationSettings).limit(1);
  return settings ?? null;
}

/**
 * Create the payout row for a paid invoice if it doesn't already exist.
 * Returns the live payout either way, or null when the lot has no
 * seller-of-record (flagged for manual handling, mirroring the shipping
 * service's behavior).
 */
export async function ensurePayoutForInvoice(invoice: LoadedInvoice): Promise<Payout | null> {
  const lot = invoice.lot;
  if (!lot?.sellerId) {
    logger.warn('Cannot create payout: lot has no seller-of-record — needs manual handling', {
      invoiceId: invoice.id,
      lotId: invoice.lotId,
    });
    return null;
  }

  const hammerPrice = invoice.hammerPrice;

  // Commission precedence: consignment agreement → prospect agreement → house rates
  let consignmentPercent: number | null = null;
  if (lot.consignmentId) {
    const [consignment] = await db
      .select({ commissionPercent: consignments.commissionPercent })
      .from(consignments)
      .where(eq(consignments.id, lot.consignmentId))
      .limit(1);
    consignmentPercent = consignment?.commissionPercent ?? null;
  }

  let prospectAgreedPercent: number | null = null;
  if (consignmentPercent == null) {
    // The lot's actual source prospect (via its upload item) — a seller with
    // several consignments can have agreed different rates per prospect.
    const [sourceItem] = await db
      .select({ prospectId: uploadItems.prospectId })
      .from(uploadItems)
      .where(eq(uploadItems.lotId, lot.id))
      .limit(1);
    if (sourceItem) {
      const [prospect] = await db
        .select({ agreedCommissionPercent: sellerProspects.agreedCommissionPercent })
        .from(sellerProspects)
        .where(eq(sellerProspects.id, sourceItem.prospectId))
        .limit(1);
      prospectAgreedPercent = prospect?.agreedCommissionPercent ?? null;
    }
    // Fallback for lots without an upload-item trail: newest agreed rate for
    // this seller (deterministic ordering).
    if (prospectAgreedPercent == null) {
      const [prospect] = await db
        .select({ agreedCommissionPercent: sellerProspects.agreedCommissionPercent })
        .from(sellerProspects)
        .where(
          and(
            eq(sellerProspects.userId, lot.sellerId),
            isNotNull(sellerProspects.agreedCommissionPercent),
          ),
        )
        .orderBy(desc(sellerProspects.createdAt))
        .limit(1);
      prospectAgreedPercent = prospect?.agreedCommissionPercent ?? null;
    }
  }

  const settings = await getSettings();
  const { percent: commissionPercent, source: commissionSource } = resolveCommission({
    hammerPrice,
    consignmentPercent,
    prospectAgreedPercent,
    settings,
  });
  const { commissionAmount, netAmount } = computePayoutAmounts(hammerPrice, commissionPercent);

  const [created] = await db
    .insert(payouts)
    .values({
      invoiceId: invoice.id,
      lotId: invoice.lotId,
      sellerId: lot.sellerId,
      hammerPrice,
      commissionPercent,
      commissionAmount,
      commissionSource,
      netAmount,
    })
    .onConflictDoNothing()
    .returning();

  if (created) {
    logger.info('Payout recorded for paid invoice', {
      invoiceId: invoice.id,
      payoutId: created.id,
      netAmount,
      commissionSource,
    });
    return created;
  }

  // Redelivery/replay — the live payout already exists.
  const [existing] = await db
    .select()
    .from(payouts)
    .where(and(eq(payouts.lotId, invoice.lotId), notInArray(payouts.status, [...DEAD_PAYOUT_STATUSES])))
    .limit(1);
  return existing ?? null;
}

/**
 * A refunded sale is unwound — the seller must not be paid for it. Cancels a
 * pending payout; if the payout was already paid out, marks it `reversed`
 * (the money must be clawed back) and raises a loud alert. Used by the
 * invoicing unwind path for both Stripe and manual refunds. Never throws.
 */
export async function cancelPayoutForRefundedInvoice(
  invoiceId: string,
  reason = 'invoice refunded',
  executor: Executor = db,
): Promise<'cancelled' | 'reversed' | 'none'> {
  const note = `${new Date().toISOString().slice(0, 10)}: ${reason}`;
  // Inside a caller's transaction (the invoicing unwind) a failure must roll
  // the whole unwind back, so only the standalone form swallows errors.
  if (executor !== db) return runPayoutCancellation(executor, invoiceId, note);
  try {
    return await runPayoutCancellation(db, invoiceId, note);
  } catch (err) {
    logger.error('Failed to cancel payout for refunded invoice', err, { invoiceId });
  }
  return 'none';
}

async function runPayoutCancellation(
  executor: Executor,
  invoiceId: string,
  note: string,
): Promise<'cancelled' | 'reversed' | 'none'> {
  {
    const cancelled = await executor
      .update(payouts)
      .set({
        status: 'cancelled',
        notes: sql`concat_ws(chr(10), ${payouts.notes}, ${`Cancelled — ${note}`})`,
        updatedAt: new Date(),
      })
      .where(and(eq(payouts.invoiceId, invoiceId), eq(payouts.status, 'pending')))
      .returning({ id: payouts.id });
    if (cancelled.length > 0) return 'cancelled';

    const reversed = await executor
      .update(payouts)
      .set({
        status: 'reversed',
        notes: sql`concat_ws(chr(10), ${payouts.notes}, ${`Reversed — ${note}. Consignor was already paid: clawback required.`})`,
        updatedAt: new Date(),
      })
      .where(and(eq(payouts.invoiceId, invoiceId), eq(payouts.status, 'paid')))
      .returning({ id: payouts.id, netAmount: payouts.netAmount });
    if (reversed.length > 0) {
      logger.error('REFUND on an invoice whose payout was already PAID — payout reversed, manual clawback required', undefined, {
        invoiceId,
        payoutId: reversed[0].id,
        netAmount: reversed[0].netAmount,
      });
      return 'reversed';
    }
  }
  return 'none';
}

async function sendStatementIfNeeded(payout: Payout, lotTitle: string, notifySellerOnSale: boolean) {
  if (!notifySellerOnSale || payout.statementSentAt) return;

  const seller = await db.query.users.findFirst({
    where: (u, { eq: eqOp }) => eqOp(u.id, payout.sellerId),
  });
  if (!seller?.email || isSentinelEmail(seller.email)) {
    logger.warn('Skipping seller statement: no reachable email for seller', {
      payoutId: payout.id,
      sellerId: payout.sellerId,
    });
    return;
  }

  // Atomically claim the send so concurrent redeliveries can't both email;
  // released on failure so a transient Resend error retries next delivery.
  const claimed = await db
    .update(payouts)
    .set({ statementSentAt: new Date(), updatedAt: new Date() })
    .where(and(eq(payouts.id, payout.id), isNull(payouts.statementSentAt)))
    .returning({ id: payouts.id });
  if (claimed.length === 0) return;

  try {
    await sendSellerStatementNotification({
      email: seller.email,
      sellerName: seller.fullName || seller.displayName || 'Consignor',
      lotTitle,
      hammerPrice: payout.hammerPrice,
      commissionPercent: payout.commissionPercent,
      commissionAmount: payout.commissionAmount,
      netAmount: payout.netAmount,
      portalUrl: portalUrl(seller.portalToken),
    });
  } catch (err) {
    await db
      .update(payouts)
      .set({ statementSentAt: null, updatedAt: new Date() })
      .where(eq(payouts.id, payout.id));
    throw err;
  }
}
