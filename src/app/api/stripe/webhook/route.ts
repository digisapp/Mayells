import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe/config';
import { db } from '@/db';
import { invoices, payments, lots, webhookLogs } from '@/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import Stripe from 'stripe';
import { logger } from '@/lib/logger';

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get('stripe-signature')!;

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    logger.error('Webhook signature verification failed', err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Dedup: skip events that have already been processed successfully
  const [alreadyProcessed] = await db
    .select({ id: webhookLogs.id })
    .from(webhookLogs)
    .where(
      and(
        eq(webhookLogs.provider, 'stripe'),
        eq(webhookLogs.eventId, event.id),
        eq(webhookLogs.status, 'success'),
      ),
    )
    .limit(1);

  if (alreadyProcessed) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  const startMs = Date.now();
  let status: 'success' | 'failed' | 'ignored' = 'ignored';
  let errorMessage: string | undefined;
  let relatedType: string | undefined;
  let relatedId: string | undefined;

  try {
    switch (event.type) {
      case 'payment_intent.succeeded': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        const invoiceId = paymentIntent.metadata.invoiceId;

        if (invoiceId) {
          relatedType = 'invoice';
          relatedId = invoiceId;

          const [invoice] = await db
            .select()
            .from(invoices)
            .where(eq(invoices.id, invoiceId))
            .limit(1);

          if (!invoice) {
            throw new Error(`Invoice ${invoiceId} not found for payment intent ${paymentIntent.id}`);
          }

          // Verify amount and currency before marking paid
          if (paymentIntent.amount !== invoice.totalAmount || paymentIntent.currency !== 'usd') {
            throw new Error(
              `Payment mismatch for invoice ${invoiceId}: received ${paymentIntent.amount} ${paymentIntent.currency}, expected ${invoice.totalAmount} usd`,
            );
          }

          // Only transition payable invoices — never resurrect refunded/cancelled
          const updated = await db
            .update(invoices)
            .set({
              status: 'paid',
              paidAt: new Date(),
              stripePaymentIntentId: paymentIntent.id,
              stripeChargeId: paymentIntent.latest_charge as string,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(invoices.id, invoiceId),
                inArray(invoices.status, ['pending', 'overdue']),
              ),
            )
            .returning({ id: invoices.id });

          if (updated.length > 0) {
            // Record the payment (update existing row for this intent, or insert one)
            const [existingPayment] = await db
              .select()
              .from(payments)
              .where(eq(payments.stripePaymentIntentId, paymentIntent.id))
              .limit(1);

            if (existingPayment) {
              await db
                .update(payments)
                .set({
                  status: 'succeeded',
                  stripeChargeId: paymentIntent.latest_charge as string,
                  updatedAt: new Date(),
                })
                .where(eq(payments.id, existingPayment.id));
            } else {
              await db.insert(payments).values({
                invoiceId,
                buyerId: invoice.buyerId,
                amount: paymentIntent.amount,
                method: 'credit_card',
                status: 'succeeded',
                stripePaymentIntentId: paymentIntent.id,
                stripeChargeId: paymentIntent.latest_charge as string,
                idempotencyKey: `pi:${paymentIntent.id}`,
              });
            }

            const lotId = paymentIntent.metadata.lotId;
            if (lotId) {
              await db
                .update(lots)
                .set({ status: 'sold', updatedAt: new Date() })
                .where(eq(lots.id, lotId));
            }
          } else {
            logger.warn('Invoice not in a payable status — skipping paid transition', {
              invoiceId,
              invoiceStatus: invoice.status,
              paymentIntentId: paymentIntent.id,
            });
          }
        }
        status = 'success';
        break;
      }

      case 'payment_intent.payment_failed': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
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
            .set({
              status: 'failed',
              failureReason,
              updatedAt: new Date(),
            })
            .where(eq(payments.id, payment.id));
        } else {
          logger.warn('Payment failed for payment intent with no payments row', {
            paymentIntentId: paymentIntent.id,
            invoiceId,
            failureReason,
          });
        }

        if (invoiceId) {
          relatedType = 'invoice';
          relatedId = invoiceId;
        }
        status = 'success';
        break;
      }

      case 'charge.refunded': {
        const charge = event.data.object as Stripe.Charge;
        const paymentIntentId = charge.payment_intent as string;
        const fullyRefunded = charge.amount_refunded >= charge.amount;

        if (paymentIntentId) {
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
              await db
                .update(invoices)
                .set({ status: 'refunded', updatedAt: new Date() })
                .where(eq(invoices.id, invoiceId));
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

          if (invoiceId) {
            relatedType = 'invoice';
            relatedId = invoiceId;
          }
        }
        status = 'success';
        break;
      }

      default:
        status = 'ignored';
    }
  } catch (error) {
    logger.error('Webhook handler error', error);
    status = 'failed';
    errorMessage = error instanceof Error ? error.message : String(error);
  } finally {
    // Persist log — this is the dedup record, so it must be awaited
    try {
      await db.insert(webhookLogs).values({
        provider: 'stripe',
        eventType: event.type,
        eventId: event.id,
        status,
        errorMessage: errorMessage ?? null,
        processingMs: Date.now() - startMs,
        payload: event as unknown as Record<string, unknown>,
        relatedType: relatedType ?? null,
        relatedId: relatedId ?? null,
      });
    } catch (err) {
      logger.warn('Failed to persist webhook log', { err: String(err) });
    }
  }

  if (status === 'failed') {
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 });
  }
  return NextResponse.json({ received: true });
}
