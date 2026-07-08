import { db } from '@/db';
import { invoices, payments, lots } from '@/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import Stripe from 'stripe';
import { logger } from '@/lib/logger';

export interface HandlerResult {
  status: 'success' | 'ignored';
  relatedType?: string;
  relatedId?: string;
}

/**
 * Single source of truth for applying a Stripe event to our data. Both the
 * live webhook and the admin replay route call this, so replay can never
 * diverge from (and skip the guards of) the real handler — amount/currency
 * verification, payable-status transitions, and partial-refund handling all
 * live here.
 */
export async function handleStripeEvent(event: Stripe.Event): Promise<HandlerResult> {
  switch (event.type) {
    case 'payment_intent.succeeded':
      return handlePaymentIntentSucceeded(event.data.object as Stripe.PaymentIntent);
    case 'payment_intent.payment_failed':
      return handlePaymentFailed(event.data.object as Stripe.PaymentIntent);
    case 'charge.refunded':
      return handleChargeRefunded(event.data.object as Stripe.Charge);
    default:
      return { status: 'ignored' };
  }
}

async function handlePaymentIntentSucceeded(
  paymentIntent: Stripe.PaymentIntent,
): Promise<HandlerResult> {
  const invoiceId = paymentIntent.metadata.invoiceId;
  if (!invoiceId) return { status: 'success' };

  const result: HandlerResult = { status: 'success', relatedType: 'invoice', relatedId: invoiceId };

  const [invoice] = await db.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1);
  if (!invoice) {
    throw new Error(`Invoice ${invoiceId} not found for payment intent ${paymentIntent.id}`);
  }

  // Verify amount and currency before marking paid
  if (paymentIntent.amount !== invoice.totalAmount || paymentIntent.currency !== 'usd') {
    throw new Error(
      `Payment mismatch for invoice ${invoiceId}: received ${paymentIntent.amount} ${paymentIntent.currency}, expected ${invoice.totalAmount} usd`,
    );
  }

  const chargeId = (paymentIntent.latest_charge as string) ?? null;

  // Only transition payable invoices — never resurrect refunded/cancelled
  const updated = await db
    .update(invoices)
    .set({
      status: 'paid',
      paidAt: new Date(),
      stripePaymentIntentId: paymentIntent.id,
      stripeChargeId: chargeId,
      updatedAt: new Date(),
    })
    .where(and(eq(invoices.id, invoiceId), inArray(invoices.status, ['pending', 'overdue'])))
    .returning({ id: invoices.id });

  if (updated.length > 0) {
    await upsertSucceededPayment(paymentIntent, invoice.buyerId, chargeId);

    const lotId = paymentIntent.metadata.lotId;
    if (lotId) {
      await db.update(lots).set({ status: 'sold', updatedAt: new Date() }).where(eq(lots.id, lotId));
    }
    return result;
  }

  // The invoice was NOT in a payable state. Distinguish two cases:
  //  - A redelivery of the SAME payment intent we already recorded — benign.
  //  - A DIFFERENT successful charge against an already-paid invoice — a real
  //    double charge. Record the payment so the money is never invisible, and
  //    raise a loud alert for manual reconciliation/refund.
  const [existingForThisIntent] = await db
    .select({ id: payments.id })
    .from(payments)
    .where(eq(payments.stripePaymentIntentId, paymentIntent.id))
    .limit(1);

  if (existingForThisIntent) {
    logger.warn('Duplicate delivery of an already-recorded payment intent — no action', {
      invoiceId,
      invoiceStatus: invoice.status,
      paymentIntentId: paymentIntent.id,
    });
    return result;
  }

  logger.error('Possible DOUBLE CHARGE: new successful payment on a non-payable invoice', undefined, {
    invoiceId,
    invoiceStatus: invoice.status,
    paymentIntentId: paymentIntent.id,
    amount: paymentIntent.amount,
  });
  await upsertSucceededPayment(paymentIntent, invoice.buyerId, chargeId);
  return result;
}

async function upsertSucceededPayment(
  paymentIntent: Stripe.PaymentIntent,
  buyerId: string,
  chargeId: string | null,
) {
  const [existingPayment] = await db
    .select()
    .from(payments)
    .where(eq(payments.stripePaymentIntentId, paymentIntent.id))
    .limit(1);

  if (existingPayment) {
    await db
      .update(payments)
      .set({ status: 'succeeded', stripeChargeId: chargeId, updatedAt: new Date() })
      .where(eq(payments.id, existingPayment.id));
    return;
  }

  await db.insert(payments).values({
    invoiceId: paymentIntent.metadata.invoiceId,
    buyerId,
    amount: paymentIntent.amount,
    method: 'credit_card',
    status: 'succeeded',
    stripePaymentIntentId: paymentIntent.id,
    stripeChargeId: chargeId,
    idempotencyKey: `pi:${paymentIntent.id}`,
  });
}

async function handlePaymentFailed(paymentIntent: Stripe.PaymentIntent): Promise<HandlerResult> {
  const invoiceId = paymentIntent.metadata.invoiceId;
  const failureReason = paymentIntent.last_payment_error?.message ?? 'Payment failed';

  const [payment] = await db
    .select()
    .from(payments)
    .where(eq(payments.stripePaymentIntentId, paymentIntent.id))
    .limit(1);

  if (payment) {
    await db
      .update(payments)
      .set({ status: 'failed', failureReason, updatedAt: new Date() })
      .where(eq(payments.id, payment.id));
  } else {
    logger.warn('Payment failed for payment intent with no payments row', {
      paymentIntentId: paymentIntent.id,
      invoiceId,
      failureReason,
    });
  }

  return invoiceId
    ? { status: 'success', relatedType: 'invoice', relatedId: invoiceId }
    : { status: 'success' };
}

async function handleChargeRefunded(charge: Stripe.Charge): Promise<HandlerResult> {
  const paymentIntentId = charge.payment_intent as string;
  if (!paymentIntentId) return { status: 'success' };

  const fullyRefunded = charge.amount_refunded >= charge.amount;

  const [payment] = await db
    .select()
    .from(payments)
    .where(eq(payments.stripePaymentIntentId, paymentIntentId))
    .limit(1);

  // Fall back to matching the invoice directly by payment intent
  let invoiceId = payment?.invoiceId ?? null;
  if (!invoiceId) {
    const [invoice] = await db
      .select({ id: invoices.id })
      .from(invoices)
      .where(eq(invoices.stripePaymentIntentId, paymentIntentId))
      .limit(1);
    invoiceId = invoice?.id ?? null;
  }

  if (fullyRefunded) {
    if (payment) {
      await db
        .update(payments)
        .set({ status: 'refunded', updatedAt: new Date() })
        .where(eq(payments.id, payment.id));
    }
    if (invoiceId) {
      // Only move a paid invoice to refunded — don't overwrite cancelled/other
      // terminal states.
      await db
        .update(invoices)
        .set({ status: 'refunded', updatedAt: new Date() })
        .where(and(eq(invoices.id, invoiceId), eq(invoices.status, 'paid')));
    }
  } else {
    // Partial refund — record the event but leave statuses unchanged
    logger.info('Partial refund received — invoice status unchanged', {
      paymentIntentId,
      invoiceId,
      amountRefunded: charge.amount_refunded,
      chargeAmount: charge.amount,
    });
  }

  return invoiceId
    ? { status: 'success', relatedType: 'invoice', relatedId: invoiceId }
    : { status: 'success' };
}
