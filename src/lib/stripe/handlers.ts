import { db } from '@/db';
import { invoices, payments, lots, users, shipments } from '@/db/schema';
import { eq, and, inArray, isNull, isNotNull, lt, sql } from 'drizzle-orm';
import { processPaidInvoice } from '@/lib/payouts/service';
import { unwindPaidInvoice, stampNote } from '@/lib/invoicing/unwind';
import {
  fromStripeAddress,
  serializeShippingAddress,
  isDeliverable,
  type StructuredShippingAddress,
} from '@/lib/shipping/address';
import Stripe from 'stripe';
import { stripe } from '@/lib/stripe/config';
import { logger } from '@/lib/logger';
import { ensurePaddleNumber } from '@/lib/bidding/verification';
import { formatCurrencyWithCents } from '@/types';

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
 * A completed Checkout session.
 *
 *  - `payment` mode (invoice checkout): capture the shipping address the
 *    buyer entered on Stripe's page. The money side is handled by the
 *    PaymentIntent events; this handler only records the address (and
 *    backfills a shipment that was created before the address arrived, since
 *    event ordering is not guaranteed).
 *  - `setup` mode (bidder card verification): mark the bidder card-verified,
 *    save the default payment method, and assign a paddle number.
 */
async function handleCheckoutSessionCompleted(
  session: Stripe.Checkout.Session,
): Promise<HandlerResult> {
  if (session.mode === 'payment') {
    const invoiceId = session.metadata?.invoiceId;
    if (!invoiceId) return { status: 'ignored' };
    const address = shippingAddressFromSession(session);
    if (address) await storeInvoiceShippingAddress(invoiceId, address);
    return { status: 'success', relatedType: 'invoice', relatedId: invoiceId };
  }

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

function shippingAddressFromSession(session: Stripe.Checkout.Session): StructuredShippingAddress | null {
  const details = session.collected_information?.shipping_details;
  if (!details?.address) return null;
  return fromStripeAddress(details.address, details.name, session.customer_details?.phone ?? null);
}

/**
 * Persist the structured checkout address on the invoice and, if a shipment
 * already exists that is waiting on it, fill it in and move it to pending.
 */
async function storeInvoiceShippingAddress(invoiceId: string, address: StructuredShippingAddress) {
  await db
    .update(invoices)
    .set({ shippingAddress: serializeShippingAddress(address), updatedAt: new Date() })
    .where(eq(invoices.id, invoiceId));

  if (!isDeliverable(address)) return;

  const backfilled = await db
    .update(shipments)
    .set({
      status: 'pending',
      ...(address.name ? { toName: address.name } : {}),
      ...(address.phone ? { toPhone: address.phone } : {}),
      toStreet: address.line1 ?? null,
      toStreet2: address.line2 ?? null,
      toCity: address.city ?? null,
      toState: address.state ?? null,
      toZip: address.postalCode ?? null,
      toCountry: address.country || 'US',
      updatedAt: new Date(),
    })
    .where(and(eq(shipments.invoiceId, invoiceId), eq(shipments.status, 'needs_address')))
    .returning({ id: shipments.id });
  if (backfilled.length > 0) {
    logger.info('Shipment address backfilled from checkout session', { invoiceId, shipmentId: backfilled[0].id });
  }
}

/**
 * The PaymentIntent event usually beats checkout.session.completed. So that
 * the shipment created by settlement has the address, look the session up
 * here when the invoice doesn't have one yet. Best-effort; never throws.
 */
async function captureShippingAddressForInvoice(
  invoice: { id: string; shippingAddress: string | null; stripeCheckoutSessionId: string | null },
  paymentIntentId: string,
) {
  if (invoice.shippingAddress) return;
  try {
    let session: Stripe.Checkout.Session | null = null;
    if (invoice.stripeCheckoutSessionId) {
      session = await stripe.checkout.sessions.retrieve(invoice.stripeCheckoutSessionId);
      if (session.payment_intent !== paymentIntentId) session = null;
    }
    if (!session) {
      const list = await stripe.checkout.sessions.list({ payment_intent: paymentIntentId, limit: 1 });
      session = list.data[0] ?? null;
    }
    if (!session) return;
    const address = shippingAddressFromSession(session);
    if (address) await storeInvoiceShippingAddress(invoice.id, address);
  } catch (err) {
    logger.warn('Could not capture shipping address from checkout session', {
      invoiceId: invoice.id,
      paymentIntentId,
      err: String(err),
    });
  }
}

/**
 * A chargeback pulls funds back from us but Stripe does NOT emit a refund, so
 * without handling it the invoice would stay `paid` and the lot `sold` while
 * the money is gone. There is no `disputed` invoice status; instead:
 *   - created      → stamp `disputedAt` (+ note). The admin list shows a
 *                    "Disputed" pill so shipment can be held / evidence filed.
 *   - closed, won  → clear `disputedAt` (+ note).
 *   - closed, lost → the money is gone for good: unwind the sale exactly like
 *                    a full refund (lot released, payout cancelled/reversed,
 *                    open shipment cancelled, buyer emailed).
 * Every step is a compare-and-swap so a redelivery is a no-op.
 */
async function handleChargeDispute(
  dispute: Stripe.Dispute,
  eventType: string,
): Promise<HandlerResult> {
  const paymentIntentId =
    typeof dispute.payment_intent === 'string' ? dispute.payment_intent : dispute.payment_intent?.id ?? null;
  const [invoice] = paymentIntentId
    ? await db
        .select({ id: invoices.id, status: invoices.status })
        .from(invoices)
        .where(eq(invoices.stripePaymentIntentId, paymentIntentId))
        .limit(1)
    : [];

  logger.error('Stripe DISPUTE received — manual reconciliation required', undefined, {
    eventType,
    disputeId: dispute.id,
    disputeStatus: dispute.status,
    reason: dispute.reason,
    amount: dispute.amount,
    paymentIntentId,
    invoiceId: invoice?.id ?? null,
  });

  if (!invoice || !paymentIntentId) return { status: 'success' };
  const result: HandlerResult = { status: 'success', relatedType: 'invoice', relatedId: invoice.id };
  const now = new Date();
  const label = `${dispute.id}${dispute.reason ? `, ${dispute.reason}` : ''}, ${formatCurrencyWithCents(dispute.amount)}`;

  if (eventType === 'charge.dispute.created') {
    // Stamp once — a redelivery must not move the timestamp or repeat the note.
    await db
      .update(invoices)
      .set({
        disputedAt: now,
        notes: sql`concat_ws(chr(10), ${invoices.notes}, ${stampNote('Dispute opened', label)})`,
        updatedAt: now,
      })
      .where(and(eq(invoices.id, invoice.id), isNull(invoices.disputedAt)));
    return result;
  }

  // charge.dispute.closed
  if (dispute.status === 'won') {
    await db
      .update(invoices)
      .set({
        disputedAt: null,
        notes: sql`concat_ws(chr(10), ${invoices.notes}, ${stampNote('Dispute won', label)})`,
        updatedAt: now,
      })
      .where(and(eq(invoices.id, invoice.id), isNotNull(invoices.disputedAt)));
    return result;
  }

  if (dispute.status === 'lost') {
    // Ledger first: the row shows the money is gone even if the invoice was
    // already unwound (e.g. refunded voluntarily while the dispute was open).
    await db
      .update(payments)
      .set({ status: 'refunded', updatedAt: now })
      .where(and(eq(payments.stripePaymentIntentId, paymentIntentId), eq(payments.status, 'succeeded')));

    // The bank already returned the money to the cardholder; a "we've issued
    // a refund" email would have them chase a second one.
    const unwound = await unwindPaidInvoice(invoice.id, `dispute lost (${label})`, { notifyBuyer: false });
    if (!unwound.unwound) {
      logger.warn('Dispute lost on an invoice that is not paid — nothing to unwind', {
        invoiceId: invoice.id,
        invoiceStatus: unwound.status,
        disputeId: dispute.id,
      });
    }
    return result;
  }

  // warning_closed / prevented / under_review etc. — informational only.
  return result;
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

  const chargeId = (paymentIntent.latest_charge as string) ?? null;

  // Verify amount and currency before marking paid. A mismatch must NOT
  // throw: the buyer has already been charged, and a 5xx only makes Stripe
  // redeliver forever while the invoice never moves. Instead the charge is
  // recorded in the ledger as-is, the invoice is flipped only if the charge
  // covers it, and a note + error log flag it for reconciliation (the admin
  // list shows a "Reconcile" pill whenever a succeeded payment ≠ total).
  const currencyOk = paymentIntent.currency === 'usd';
  const amountMismatch = !currencyOk || paymentIntent.amount !== invoice.totalAmount;
  const coversInvoice = currencyOk && paymentIntent.amount >= invoice.totalAmount;
  const mismatchNote = amountMismatch
    ? `${new Date().toISOString().slice(0, 10)} Stripe charged ${formatCharged(paymentIntent)} vs invoice ${formatCurrencyWithCents(invoice.totalAmount)} — reconcile`
    : null;
  if (mismatchNote) {
    logger.error('Stripe charge does not match invoice total — reconcile', undefined, {
      invoiceId,
      invoiceStatus: invoice.status,
      paymentIntentId: paymentIntent.id,
      charged: paymentIntent.amount,
      currency: paymentIntent.currency,
      expected: invoice.totalAmount,
    });
  }

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

  // Underpaid (or wrong currency) on an open invoice: keep the money visible
  // in the ledger, but the invoice stays payable — it is NOT settled, the lot
  // is not sold, and no payout/shipment is created. Idempotent: the note is
  // written only when the payment row is first inserted. (A short charge on
  // a NON-payable invoice falls through to the stray-payment path below.)
  if (!coversInvoice && (invoice.status === 'pending' || invoice.status === 'overdue')) {
    const recorded = await upsertSucceededPayment(paymentIntent, invoice.buyerId, chargeId);
    if (recorded === 'inserted' && mismatchNote) {
      await db
        .update(invoices)
        .set({
          notes: sql`concat_ws(chr(10), ${invoices.notes}, ${mismatchNote})`,
          // The session that took the short payment is now complete. Clearing
          // it lets the buyer's pay link mint a fresh one instead of answering
          // "payment is being processed" forever.
          stripeCheckoutSessionId: null,
          updatedAt: new Date(),
        })
        .where(eq(invoices.id, invoiceId));
    }
    return result;
  }

  // Only transition payable invoices — never resurrect refunded/cancelled.
  // An overcharge still settles the sale; the note/pill flag the difference.
  const updated = await db
    .update(invoices)
    .set({
      status: 'paid',
      paidAt: new Date(),
      stripePaymentIntentId: paymentIntent.id,
      stripeChargeId: chargeId,
      ...(mismatchNote ? { notes: sql`concat_ws(chr(10), ${invoices.notes}, ${mismatchNote})` } : {}),
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

    // The shipment created below needs the address the buyer typed at
    // checkout — fetch it now in case checkout.session.completed hasn't
    // arrived yet.
    await captureShippingAddressForInvoice(invoice, paymentIntent.id);

    // Seller-side settlement: record the payout, create the shipment, send the
    // seller statement + buyer confirmation. Internally guarded — never throws.
    await processPaidInvoice(invoiceId, { sendBuyerConfirmation: true });
    return result;
  }

  // The invoice was NOT in a payable state. Distinguish two cases:
  //  - A redelivery of the SAME payment intent we already recorded — benign.
  //  - A DIFFERENT successful charge against a non-payable invoice — money we
  //    must not keep. Record the payment so it is never invisible, refund it
  //    automatically, and raise a loud alert.
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
    // A stray charge is recorded BEFORE it is refunded, so a Stripe failure
    // (or a crash) between the two would otherwise be invisible forever:
    // every later redelivery lands here. Retry the refund — it is idempotent
    // on the intent, and Stripe answers `charge_already_refunded` if it did
    // go through.
    if (invoice.stripePaymentIntentId !== paymentIntent.id) {
      await autoRefundStrayPayment(paymentIntent, invoiceId);
    }
    // Self-heal: if a prior delivery marked the invoice paid but crashed before
    // the seller-side settlement finished, this re-run completes it (every step
    // is idempotent). Skipped for refunded/cancelled invoices.
    if (invoice.status === 'paid') {
      await captureShippingAddressForInvoice(invoice, paymentIntent.id);
      await processPaidInvoice(invoiceId);
    }
    return result;
  }

  logger.error('STRAY PAYMENT: new successful charge on a non-payable invoice — auto-refunding', undefined, {
    invoiceId,
    invoiceStatus: invoice.status,
    paymentIntentId: paymentIntent.id,
    invoicePaymentIntentId: invoice.stripePaymentIntentId,
    amount: paymentIntent.amount,
  });
  await upsertSucceededPayment(paymentIntent, invoice.buyerId, chargeId);

  // A cancelled/refunded invoice can't be paid, and a paid invoice was paid by
  // a different intent (double charge) — either way the buyer gets it back.
  if (invoice.stripePaymentIntentId !== paymentIntent.id) {
    await autoRefundStrayPayment(paymentIntent, invoiceId);
  }
  return result;
}

/**
 * Refund a payment we must not keep. Idempotent on the intent id so a
 * webhook redelivery can't refund twice; a Stripe failure is logged loudly
 * (the payments row still shows the money) rather than failing the webhook.
 */
async function autoRefundStrayPayment(paymentIntent: Stripe.PaymentIntent, invoiceId: string) {
  try {
    const refund = await stripe.refunds.create(
      { payment_intent: paymentIntent.id, reason: 'duplicate' },
      { idempotencyKey: `auto-refund:${paymentIntent.id}` },
    );
    logger.error('Stray payment auto-refunded', undefined, {
      invoiceId,
      paymentIntentId: paymentIntent.id,
      refundId: refund.id,
      amount: refund.amount,
    });
  } catch (err) {
    logger.error('AUTO-REFUND FAILED — refund this payment manually in the Stripe dashboard', err, {
      invoiceId,
      paymentIntentId: paymentIntent.id,
      amount: paymentIntent.amount,
    });
  }
}

/** Human-readable charged amount for notes; non-USD is shown in minor units. */
function formatCharged(paymentIntent: Stripe.PaymentIntent): string {
  return paymentIntent.currency === 'usd'
    ? formatCurrencyWithCents(paymentIntent.amount)
    : `${paymentIntent.amount} ${paymentIntent.currency.toUpperCase()} (minor units)`;
}

/**
 * Ledger row for a succeeded PaymentIntent, idempotent on the intent id. The
 * amount is always what Stripe actually charged — never the invoice total —
 * so a mismatch is visible in the ledger.
 */
async function upsertSucceededPayment(
  paymentIntent: Stripe.PaymentIntent,
  buyerId: string,
  chargeId: string | null,
): Promise<'inserted' | 'updated'> {
  const [existingPayment] = await db
    .select()
    .from(payments)
    .where(eq(payments.stripePaymentIntentId, paymentIntent.id))
    .limit(1);

  if (existingPayment) {
    await db
      .update(payments)
      .set({ status: 'succeeded', amount: paymentIntent.amount, stripeChargeId: chargeId, updatedAt: new Date() })
      .where(eq(payments.id, existingPayment.id));
    return 'updated';
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
  return 'inserted';
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

  const result: HandlerResult = invoiceId
    ? { status: 'success', relatedType: 'invoice', relatedId: invoiceId }
    : { status: 'success' };

  // Mirror Stripe's running total onto the invoice's payment of record so a
  // partial refund is visible ("Partially refunded $X" pill) without
  // unwinding the sale.
  if (invoiceId) await recordRefundedAmount(invoiceId, paymentIntentId, charge);

  if (!fullyRefunded) {
    // Partial refund — the sale stands; statuses unchanged
    logger.info('Partial refund received — invoice status unchanged', {
      paymentIntentId,
      invoiceId,
      amountRefunded: charge.amount_refunded,
      chargeAmount: charge.amount,
    });
    return result;
  }

  if (payment) {
    await db
      .update(payments)
      .set({ status: 'refunded', updatedAt: new Date() })
      .where(eq(payments.id, payment.id));
  }
  if (!invoiceId) return result;

  // Only the invoice's payment-of-record unwinds the sale. A refund of a
  // stray/duplicate charge (see autoRefundStrayPayment) must leave a
  // legitimately paid invoice alone.
  const [invoice] = await db
    .select({ status: invoices.status, stripePaymentIntentId: invoices.stripePaymentIntentId })
    .from(invoices)
    .where(eq(invoices.id, invoiceId))
    .limit(1);
  if (!invoice) return result;

  if (invoice.stripePaymentIntentId !== paymentIntentId) {
    logger.warn('Refund is not for the invoice\'s payment of record — invoice untouched', {
      invoiceId,
      invoiceStatus: invoice.status,
      invoicePaymentIntentId: invoice.stripePaymentIntentId,
      refundedPaymentIntentId: paymentIntentId,
    });
    return result;
  }

  const unwound = await unwindPaidInvoice(invoiceId, `Stripe refund of charge ${charge.id}`);
  if (!unwound.unwound) {
    logger.info('Refund received for an invoice that is not paid — nothing to unwind', {
      invoiceId,
      invoiceStatus: unwound.status,
    });
  }
  return result;
}

/**
 * Copy `charge.amount_refunded` (Stripe's cumulative total for the charge)
 * onto the invoice. Setting rather than adding keeps this idempotent on
 * redelivery and monotonic when partial-refund events arrive out of order.
 * Payment-of-record only: a refunded stray/duplicate charge must not show as
 * a partial refund of a legitimately paid invoice. A full refund is noted by
 * the unwind itself, so only partial refunds add a note here.
 */
async function recordRefundedAmount(invoiceId: string, paymentIntentId: string, charge: Stripe.Charge) {
  const amount = charge.amount_refunded;
  const partial = amount < charge.amount;
  await db
    .update(invoices)
    .set({
      refundedAmount: amount,
      ...(partial
        ? {
            notes: sql`concat_ws(chr(10), ${invoices.notes}, ${stampNote(
              'Partially refunded',
              `${formatCurrencyWithCents(amount)} of ${formatCurrencyWithCents(charge.amount)} via Stripe (${charge.id})`,
            )})`,
          }
        : {}),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(invoices.id, invoiceId),
        eq(invoices.stripePaymentIntentId, paymentIntentId),
        lt(invoices.refundedAmount, amount),
      ),
    );
}
