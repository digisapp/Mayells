import { db } from '@/db';
import { invoices, payments, lots, users } from '@/db/schema';
import { eq, and, inArray, isNull } from 'drizzle-orm';
import { processPaidInvoice, cancelPayoutForRefundedInvoice } from '@/lib/payouts/service';
import Stripe from 'stripe';
import { stripe } from '@/lib/stripe/config';
import { logger } from '@/lib/logger';
import { ensurePaddleNumber } from '@/lib/bidding/verification';

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
    case 'charge.dispute.created':
    case 'charge.dispute.closed':
      return handleChargeDispute(event.data.object as Stripe.Dispute, event.type);
    case 'checkout.session.completed':
      return handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session);
    case 'identity.verification_session.verified':
      return handleIdentityVerified(event.data.object as Stripe.Identity.VerificationSession);
    default:
      return { status: 'ignored' };
  }
}

/**
 * A Stripe Identity session that passed. Mark the bidder identity-verified
 * (Tier 3), lifting their bid ceiling. Guarded so it only ever acts on our own
 * bidder-identity sessions and never clobbers an earlier verification time.
 */
async function handleIdentityVerified(
  session: Stripe.Identity.VerificationSession,
): Promise<HandlerResult> {
  if (session.metadata?.purpose !== 'bidder_identity_verification') {
    return { status: 'ignored' };
  }
  const userId = session.metadata?.userId;
  if (!userId) return { status: 'ignored' };

  await db
    .update(users)
    .set({ identityVerifiedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(users.id, userId), isNull(users.identityVerifiedAt)));

  // A high-value bidder should have a paddle even if they skipped card
  // verification and went straight to identity.
  await ensurePaddleNumber(userId);

  return { status: 'success', relatedType: 'user', relatedId: userId };
}

/**
 * A completed Checkout session. We only act on `setup`-mode sessions created for
 * bidder card verification: mark the bidder card-verified, save the default
 * payment method, and assign a paddle number. Payment-mode sessions are handled
 * via their PaymentIntent events, so they're ignored here.
 */
async function handleCheckoutSessionCompleted(
  session: Stripe.Checkout.Session,
): Promise<HandlerResult> {
  if (session.mode !== 'setup' || session.metadata?.purpose !== 'bidder_card_verification') {
    return { status: 'ignored' };
  }
  const userId = session.metadata?.userId;
  if (!userId) return { status: 'ignored' };

  // Persist the saved card as the customer's default so it's reusable at checkout.
  const setupIntentId = typeof session.setup_intent === 'string' ? session.setup_intent : null;
  let paymentMethodId: string | null = null;
  if (setupIntentId) {
    try {
      const si = await stripe.setupIntents.retrieve(setupIntentId);
      paymentMethodId = typeof si.payment_method === 'string' ? si.payment_method : si.payment_method?.id ?? null;
      if (paymentMethodId && typeof session.customer === 'string') {
        await stripe.customers.update(session.customer, {
          invoice_settings: { default_payment_method: paymentMethodId },
        });
      }
    } catch (err) {
      logger.warn('Could not attach default payment method after verification', {
        userId,
        err: String(err),
      });
    }
  }

  // Mark card-verified only once (don't clobber the original timestamp).
  await db
    .update(users)
    .set({ cardVerifiedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(users.id, userId), isNull(users.cardVerifiedAt)));

  await ensurePaddleNumber(userId);

  return { status: 'success', relatedType: 'user', relatedId: userId };
}

/**
 * A chargeback pulls funds back from us but Stripe does NOT emit a refund, so
 * without handling it the invoice would stay `paid` and the lot `sold` while
 * the money is gone. There is no `disputed` invoice status, so raise a loud
 * alert for manual reconciliation (hold shipment, decide whether to contest).
 */
async function handleChargeDispute(
  dispute: Stripe.Dispute,
  eventType: string,
): Promise<HandlerResult> {
  const paymentIntentId = (dispute.payment_intent as string) ?? null;
  let invoiceId: string | null = null;
  if (paymentIntentId) {
    const [invoice] = await db
      .select({ id: invoices.id })
      .from(invoices)
      .where(eq(invoices.stripePaymentIntentId, paymentIntentId))
      .limit(1);
    invoiceId = invoice?.id ?? null;
  }

  logger.error('Stripe DISPUTE received — manual reconciliation required', undefined, {
    eventType,
    disputeStatus: dispute.status,
    reason: dispute.reason,
    amount: dispute.amount,
    paymentIntentId,
    invoiceId,
  });

  return invoiceId
    ? { status: 'success', relatedType: 'invoice', relatedId: invoiceId }
    : { status: 'success' };
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

  // Out-of-order delivery guard: if the charge was already refunded (refund
  // event processed first, or refunded from the dashboard while our endpoint
  // was down), do NOT mark the invoice paid — that would re-sell the lot and
  // owe the seller a payout for money we returned.
  if (chargeId) {
    const charge = await stripe.charges.retrieve(chargeId);
    if (charge.refunded) {
      logger.error('payment_intent.succeeded for an already-refunded charge — manual reconciliation required', undefined, {
        invoiceId,
        paymentIntentId: paymentIntent.id,
        chargeId,
      });
      return result;
    }
  }

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

    // Seller-side settlement: record the payout, create the shipment, send the
    // seller statement + buyer confirmation. Internally guarded — never throws.
    await processPaidInvoice(invoiceId, { sendBuyerConfirmation: true });
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
    // Self-heal: if a prior delivery marked the invoice paid but crashed before
    // the seller-side settlement finished, this re-run completes it (every step
    // is idempotent). Skipped for refunded/cancelled invoices.
    if (invoice.status === 'paid') {
      await processPaidInvoice(invoiceId);
    }
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
    // Never overwrite a terminal success/refund with a late or replayed
    // failure event (e.g. a reused PaymentIntent that declined once then
    // succeeded, delivered out of order). Only pending/processing → failed.
    if (payment.status === 'succeeded' || payment.status === 'refunded') {
      logger.warn('Ignoring payment_failed for an already-settled payment', {
        paymentIntentId: paymentIntent.id,
        currentStatus: payment.status,
      });
    } else {
      await db
        .update(payments)
        .set({ status: 'failed', failureReason, updatedAt: new Date() })
        .where(eq(payments.id, payment.id));
    }
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
  // Last resort: the PaymentIntent's metadata (set at checkout creation).
  // Needed when the refund event arrives before the succeeded event ever
  // wrote a payments row or stamped the invoice.
  if (!invoiceId) {
    try {
      const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
      invoiceId = pi.metadata?.invoiceId ?? null;
    } catch (err) {
      logger.warn('Could not resolve invoice for refunded charge via payment intent', {
        paymentIntentId,
        err: String(err),
      });
    }
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
      const refundedInvoice = await db
        .update(invoices)
        .set({ status: 'refunded', updatedAt: new Date() })
        .where(and(eq(invoices.id, invoiceId), eq(invoices.status, 'paid')))
        .returning({ lotId: invoices.lotId });

      // The sale is unwound — release the lot so it isn't stuck 'sold' with a
      // winner. Mark it 'unsold' so an admin can relist/re-auction it.
      if (refundedInvoice.length > 0) {
        await db
          .update(lots)
          .set({ status: 'unsold', winnerId: null, hammerPrice: null, updatedAt: new Date() })
          .where(eq(lots.id, refundedInvoice[0].lotId));
      }

      // The seller must not be paid for an unwound sale.
      await cancelPayoutForRefundedInvoice(invoiceId);
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
