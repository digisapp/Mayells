import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe/config';
import { db } from '@/db';
import { invoices, payments, lots, webhookLogs } from '@/db/schema';
import { eq } from 'drizzle-orm';
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
          await db
            .update(invoices)
            .set({
              status: 'paid',
              paidAt: new Date(),
              stripeChargeId: paymentIntent.latest_charge as string,
              updatedAt: new Date(),
            })
            .where(eq(invoices.id, invoiceId));

          await db
            .update(payments)
            .set({
              status: 'succeeded',
              stripeChargeId: paymentIntent.latest_charge as string,
              updatedAt: new Date(),
            })
            .where(eq(payments.stripePaymentIntentId, paymentIntent.id));

          const lotId = paymentIntent.metadata.lotId;
          if (lotId) {
            await db
              .update(lots)
              .set({ status: 'sold', updatedAt: new Date() })
              .where(eq(lots.id, lotId));
          }

          relatedType = 'invoice';
          relatedId = invoiceId;
        }
        status = 'success';
        break;
      }

      case 'payment_intent.payment_failed': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        const invoiceId = paymentIntent.metadata.invoiceId;

        if (invoiceId) {
          await db
            .update(payments)
            .set({
              status: 'failed',
              failureReason: paymentIntent.last_payment_error?.message ?? 'Payment failed',
              updatedAt: new Date(),
            })
            .where(eq(payments.stripePaymentIntentId, paymentIntent.id));

          relatedType = 'invoice';
          relatedId = invoiceId;
        }
        status = 'success';
        break;
      }

      case 'charge.refunded': {
        const charge = event.data.object as Stripe.Charge;
        const paymentIntentId = charge.payment_intent as string;

        if (paymentIntentId) {
          const [payment] = await db
            .select()
            .from(payments)
            .where(eq(payments.stripePaymentIntentId, paymentIntentId))
            .limit(1);

          if (payment) {
            await db
              .update(payments)
              .set({ status: 'refunded', updatedAt: new Date() })
              .where(eq(payments.id, payment.id));

            await db
              .update(invoices)
              .set({ status: 'refunded', updatedAt: new Date() })
              .where(eq(invoices.id, payment.invoiceId));

            relatedType = 'invoice';
            relatedId = payment.invoiceId;
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
    // Persist log — never throw, just warn
    db.insert(webhookLogs).values({
      provider: 'stripe',
      eventType: event.type,
      eventId: event.id,
      status,
      errorMessage: errorMessage ?? null,
      processingMs: Date.now() - startMs,
      payload: event as unknown as Record<string, unknown>,
      relatedType: relatedType ?? null,
      relatedId: relatedId ?? null,
    }).catch((err) => logger.warn('Failed to persist webhook log', { err: String(err) }));
  }

  if (status === 'failed') {
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 });
  }
  return NextResponse.json({ received: true });
}
