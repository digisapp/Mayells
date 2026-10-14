/**
 * Pure decisions about Stripe state versus our invoice state, shared by the
 * buyer's pay route, the admin manual mark-paid guard and the webhook
 * handler. No I/O, so the rules are unit-tested on their own.
 */

import type Stripe from 'stripe';

/** A retrieved Checkout session, ideally with `payment_intent` expanded. */
export type CheckoutSessionState = Pick<Stripe.Checkout.Session, 'status' | 'payment_status' | 'url'> & {
  payment_intent: string | Pick<Stripe.PaymentIntent, 'status'> | null;
};

/**
 * PaymentIntent states in which a completed session took no money and never
 * will: a delayed method (ACH) failed after checkout, or the intent was
 * cancelled. The buyer needs a new session to pay.
 */
const DEAD_INTENT_STATUSES: readonly string[] = ['requires_payment_method', 'canceled'];

function intentStatus(session: CheckoutSessionState): string | null {
  const pi = session.payment_intent;
  return pi && typeof pi === 'object' ? pi.status : null;
}

export type StoredSessionAction = 'reuse' | 'processing' | 'replace';

/**
 * What the pay route does with the session already stored on the invoice:
 *  - reuse      — still open: send the buyer back to it (no second intent);
 *  - processing — the buyer paid (or a payment is settling) and the webhook
 *                 hasn't flipped the invoice yet: never mint a second session;
 *  - replace    — expired, or completed but its payment failed: mint a new one.
 */
export function storedSessionAction(session: CheckoutSessionState): StoredSessionAction {
  if (session.status === 'open') return session.url ? 'reuse' : 'replace';
  if (session.status === 'complete') {
    const status = intentStatus(session);
    if (session.payment_status !== 'paid' && status && DEAD_INTENT_STATUSES.includes(status)) return 'replace';
    return 'processing';
  }
  return 'replace';
}

/**
 * Whether Stripe has taken (or is still settling) a payment on this session.
 * The admin must not record a wire/check on top of it: the card webhook would
 * then arrive for an invoice that already looks paid. A completed session
 * whose intent we can't see counts as "processing" (fail closed).
 */
export function cardPaymentOnSession(session: CheckoutSessionState): 'paid' | 'processing' | null {
  if (session.payment_status === 'paid') return 'paid';
  if (session.status !== 'complete') return null;
  const status = intentStatus(session);
  if (status === 'succeeded' || status === 'requires_capture') return 'paid';
  if (status && DEAD_INTENT_STATUSES.includes(status)) return null;
  return 'processing';
}

export type StrayPaymentAction = 'none' | 'hold' | 'refund';

/**
 * A successful charge arrived for an invoice that could not take it (not
 * pending/overdue). Decide what to do with the money:
 *  - none   — it IS the invoice's payment of record (a redelivery);
 *  - hold   — the invoice was marked paid by hand (wire/check — the only way
 *             an invoice is paid without a payment intent). Either that record
 *             is the mistake and the card is the real payment, or the buyer
 *             paid twice: an admin decides, nothing is refunded automatically;
 *  - refund — a cancelled/refunded invoice, or a paid one settled by a
 *             DIFFERENT card payment (a true double charge): give it back.
 */
export function strayPaymentAction(
  invoice: { status: string; stripePaymentIntentId: string | null },
  paymentIntentId: string,
): StrayPaymentAction {
  if (invoice.stripePaymentIntentId === paymentIntentId) return 'none';
  if (invoice.status === 'paid' && !invoice.stripePaymentIntentId) return 'hold';
  return 'refund';
}
