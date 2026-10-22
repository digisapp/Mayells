/**
 * Settlement steps that only gallery (fixed-price) sales need.
 *
 * An auction lot is already `sold` to its winner before its invoice exists.
 * A gallery piece stays `for_sale` (reserved by its live invoice) until the
 * money arrives, so the paid invoice is what marks it sold — whether the
 * payment came through the Stripe webhook or an admin recording a wire.
 */

import type Stripe from 'stripe';
import { db } from '@/db';
import { invoices, lots, consignments } from '@/db/schema';
import { and, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { stripe } from '@/lib/stripe/config';
import { revalidatePublicCatalog } from '@/lib/revalidate';
import { logger } from '@/lib/logger';
import { galleryTotalsFromSession } from './totals';

interface PayableHold {
  id: string;
  status: string;
  hammerPrice: number;
  shippingCost: number | null;
  taxAmount: number | null;
  totalAmount: number;
  stripeCheckoutSessionId: string | null;
}

/**
 * A Buy Now payment has landed: copy the tax Stripe calculated (and the
 * session's final total) onto the hold invoice, so the webhook's amount check
 * compares the charge with the real total. Only when the price and shipping
 * on Stripe's side are exactly the ones the hold set; otherwise the invoice
 * is left as it is and the amount check flags the difference.
 *
 * Throws when Stripe can't be reached: nothing has been written yet, so the
 * webhook answers 5xx and Stripe redelivers. Carrying on would mark the
 * invoice paid without its tax, and no redelivery could correct it.
 */
export async function applyCheckoutTotalsToHold<T extends PayableHold>(invoice: T, paymentIntentId: string): Promise<T> {
  let session: Stripe.Checkout.Session | null = null;
  try {
    if (invoice.stripeCheckoutSessionId) {
      session = await stripe.checkout.sessions.retrieve(invoice.stripeCheckoutSessionId);
      const intent = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;
      if (intent !== paymentIntentId) session = null;
    }
    if (!session) {
      const list = await stripe.checkout.sessions.list({ payment_intent: paymentIntentId, limit: 1 });
      session = list.data[0] ?? null;
    }
  } catch (err) {
    logger.warn('Buy Now: could not load the checkout session to read its tax — failing so Stripe redelivers', {
      invoiceId: invoice.id,
      paymentIntentId,
      err: String(err),
    });
    throw err;
  }
  if (!session) return invoice;

  const totals = galleryTotalsFromSession(invoice, session);
  if (!totals.ok) {
    logger.error('Buy Now: checkout session totals do not match the hold — reconcile', undefined, {
      invoiceId: invoice.id,
      sessionId: session.id,
      reason: totals.reason,
    });
    return invoice;
  }
  if (
    totals.totalAmount === invoice.totalAmount &&
    totals.taxAmount === (invoice.taxAmount ?? 0) &&
    totals.shippingCost === (invoice.shippingCost ?? 0)
  ) {
    return invoice;
  }

  const [updated] = await db
    .update(invoices)
    .set({
      shippingCost: totals.shippingCost,
      taxAmount: totals.taxAmount,
      totalAmount: totals.totalAmount,
      updatedAt: new Date(),
    })
    .where(and(eq(invoices.id, invoice.id), inArray(invoices.status, ['pending', 'overdue'])))
    .returning({ id: invoices.id });
  if (!updated) return invoice;
  return { ...invoice, shippingCost: totals.shippingCost, taxAmount: totals.taxAmount, totalAmount: totals.totalAmount };
}

/**
 * Mark the piece sold to the invoice's buyer at the invoice price, and its
 * consignment sold. Idempotent. A piece that is already sold to someone else
 * is never touched — that would be a double sale, so it is flagged loudly
 * on the invoice for staff instead. Throws on a database error.
 */
export async function markGalleryLotSold(invoice: {
  id: string;
  lotId: string;
  buyerId: string;
  hammerPrice: number;
}): Promise<'sold' | 'conflict'> {
  const now = new Date();
  const [lot] = await db
    .update(lots)
    .set({ status: 'sold', winnerId: invoice.buyerId, hammerPrice: invoice.hammerPrice, updatedAt: now })
    .where(
      and(
        eq(lots.id, invoice.lotId),
        or(isNull(lots.winnerId), eq(lots.winnerId, invoice.buyerId)),
      ),
    )
    .returning({ id: lots.id, consignmentId: lots.consignmentId });

  if (!lot) {
    logger.error('GALLERY DOUBLE SALE: paid invoice for a piece already sold to someone else — refund one buyer', undefined, {
      invoiceId: invoice.id,
      lotId: invoice.lotId,
    });
    await db
      .update(invoices)
      .set({
        // Same "YYYY-MM-DD Prefix: reason" line as invoicing/unwind's stampNote,
        // written out here because unwind depends on the payout service,
        // which depends on this module.
        notes: sql`concat_ws(chr(10), ${invoices.notes}, ${`${now.toISOString().slice(0, 10)} ATTENTION: paid, but the piece is already sold to another buyer — refund this invoice or the other sale`}::text)`,
        updatedAt: now,
      })
      .where(eq(invoices.id, invoice.id));
    return 'conflict';
  }

  if (lot.consignmentId) {
    await db
      .update(consignments)
      .set({ status: 'sold', updatedAt: now })
      .where(eq(consignments.id, lot.consignmentId));
  }
  revalidatePublicCatalog();
  return 'sold';
}
