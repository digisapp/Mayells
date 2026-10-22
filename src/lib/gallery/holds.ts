/**
 * Buy Now checkout holds.
 *
 * Starting checkout creates a pending gallery invoice with `holdExpiresAt`
 * set; the per-lot live-invoice unique index makes that invoice the hold, so
 * nobody else can start checkout on the piece meanwhile. The Stripe session
 * expires at the same moment. A hold that wasn't paid is released by
 * cancelling its invoice — but only once Stripe confirms the session can no
 * longer take money: cancelling first would turn a payment completed in the
 * last second into a stray charge that has to be refunded.
 *
 * Releases come from three places: the `checkout.session.expired` webhook,
 * the lifecycle cron's sweep (the backstop when that event isn't delivered),
 * and the checkout route itself when a new buyer finds a lapsed hold.
 */

import Stripe from 'stripe';
import { db } from '@/db';
import { invoices } from '@/db/schema';
import { and, asc, eq, isNotNull, lte, sql } from 'drizzle-orm';
import { stripe, isStripeConfigured } from '@/lib/stripe/config';
import { cardPaymentOnSession } from '@/lib/stripe/reconcile';
import { stampNote } from '@/lib/invoicing/unwind';
import { logger } from '@/lib/logger';

/**
 * A hold with no Checkout session on record (its session id failed to save)
 * is only released this long after it lapsed: the session, if Stripe made
 * one, expired with the hold, and this leaves room for a payment that was
 * mid-flight at that moment to report in.
 */
export const ORPHAN_HOLD_GRACE_MS = 10 * 60 * 1000;

export const HOLD_SWEEP_BATCH = 50;

export type HoldRelease =
  /** The invoice was cancelled; the piece is on sale again. */
  | 'released'
  /** Stripe took (or is still settling) a payment on the session: the payment webhook decides. */
  | 'paying'
  /** Not a pending hold any more (paid, cancelled, or not a hold at all). */
  | 'not_held'
  /** Couldn't confirm with Stripe; try again later. */
  | 'unknown';

export interface HoldInvoice {
  id: string;
  status: string;
  holdExpiresAt: Date | null;
  stripeCheckoutSessionId: string | null;
}

/** Cancel a pending hold. Compare-and-swap, so a payment that just landed wins. */
async function cancelHold(invoice: HoldInvoice, reason: string, now: Date): Promise<boolean> {
  const released = await db
    .update(invoices)
    .set({
      status: 'cancelled',
      notes: sql`concat_ws(chr(10), ${invoices.notes}, ${stampNote('Checkout hold released', reason)}::text)`,
      updatedAt: now,
    })
    .where(and(eq(invoices.id, invoice.id), eq(invoices.status, 'pending'), isNotNull(invoices.holdExpiresAt)))
    .returning({ id: invoices.id });
  return released.length > 0;
}

/**
 * Release a hold whose time is up, or whose session is already gone.
 * `force` skips the time check — used when the hold's own session has
 * expired early or could not be created at all.
 */
export async function releaseGalleryHold(
  invoice: HoldInvoice,
  reason: string,
  opts: { now?: Date; force?: boolean } = {},
): Promise<HoldRelease> {
  const now = opts.now ?? new Date();
  if (invoice.status !== 'pending' || !invoice.holdExpiresAt) return 'not_held';
  if (!opts.force && invoice.holdExpiresAt.getTime() > now.getTime()) return 'unknown';

  if (!invoice.stripeCheckoutSessionId) {
    const lapsedFor = now.getTime() - invoice.holdExpiresAt.getTime();
    if (!opts.force && lapsedFor < ORPHAN_HOLD_GRACE_MS) return 'unknown';
    return (await cancelHold(invoice, reason, now)) ? 'released' : 'not_held';
  }

  if (!isStripeConfigured()) return 'unknown';

  const sessionId = invoice.stripeCheckoutSessionId;
  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ['payment_intent'] });
    if (session.status === 'open') {
      // Past its time but Stripe hasn't expired it yet (or `force`): expire it
      // now so it can't take a payment after we cancel.
      session = await stripe.checkout.sessions.expire(sessionId, undefined, {
        idempotencyKey: `expire:${sessionId}`,
      });
    }
  } catch (err) {
    // A session Stripe doesn't know (e.g. made with an old key) can't take a payment.
    const missing = err instanceof Stripe.errors.StripeInvalidRequestError && err.code === 'resource_missing';
    if (!missing) {
      logger.warn('Gallery hold: could not check its Checkout session — will retry', {
        invoiceId: invoice.id,
        sessionId,
        err: String(err),
      });
      return 'unknown';
    }
    return (await cancelHold(invoice, reason, now)) ? 'released' : 'not_held';
  }

  if (session.status === 'complete' && cardPaymentOnSession(session) !== null) return 'paying';
  if (session.status === 'open') return 'unknown';
  return (await cancelHold(invoice, reason, now)) ? 'released' : 'not_held';
}

/**
 * The `checkout.session.expired` webhook. The session is already dead, so
 * no Stripe call is needed — just make sure it is this hold's own session.
 */
export async function releaseHoldForExpiredSession(invoiceId: string, sessionId: string): Promise<boolean> {
  const now = new Date();
  const released = await db
    .update(invoices)
    .set({
      status: 'cancelled',
      notes: sql`concat_ws(chr(10), ${invoices.notes}, ${stampNote('Checkout hold released', 'checkout expired unpaid')}::text)`,
      updatedAt: now,
    })
    .where(
      and(
        eq(invoices.id, invoiceId),
        eq(invoices.status, 'pending'),
        isNotNull(invoices.holdExpiresAt),
        eq(invoices.stripeCheckoutSessionId, sessionId),
      ),
    )
    .returning({ id: invoices.id });
  return released.length > 0;
}

/** Lifecycle-cron sweep: release every lapsed hold Stripe confirms is unpaid. */
export async function releaseLapsedGalleryHolds(now: Date = new Date(), limit = HOLD_SWEEP_BATCH) {
  const lapsed = await db
    .select({
      id: invoices.id,
      status: invoices.status,
      holdExpiresAt: invoices.holdExpiresAt,
      stripeCheckoutSessionId: invoices.stripeCheckoutSessionId,
    })
    .from(invoices)
    .where(and(eq(invoices.status, 'pending'), isNotNull(invoices.holdExpiresAt), lte(invoices.holdExpiresAt, now)))
    .orderBy(asc(invoices.holdExpiresAt))
    .limit(limit);

  const result = { released: 0, paying: 0, pending: 0 };
  for (const hold of lapsed) {
    const outcome = await releaseGalleryHold(hold, 'checkout not completed in time', { now });
    if (outcome === 'released') result.released++;
    else if (outcome === 'unknown') result.pending++;
    else if (outcome === 'paying') {
      result.paying++;
      // Paid at Stripe, yet the invoice is still a pending hold well after
      // checkout closed: the payment webhook never landed. The piece stays
      // reserved (it is sold), but someone has to replay the event.
      if (hold.holdExpiresAt && now.getTime() - hold.holdExpiresAt.getTime() > 15 * 60 * 1000) {
        logger.error('Buy Now paid at Stripe but the invoice was never marked paid — replay its webhook from /admin/webhooks', undefined, {
          invoiceId: hold.id,
          sessionId: hold.stripeCheckoutSessionId,
        });
      }
    }
  }
  return result;
}
