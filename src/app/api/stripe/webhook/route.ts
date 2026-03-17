import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe/config';
import { db } from '@/db';
import { invoices, payments, lots } from '@/db/schema';
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

  try {
    switch (event.type) {
      case 'payment_intent.succeeded': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        const invoiceId = paymentIntent.metadata.invoiceId;

        if (invoiceId) {
          // Update invoice
          await db
            .update(invoices)
            .set({
              status: 'paid',
              paidAt: new Date(),
              stripeChargeId: paymentIntent.latest_charge as string,
              updatedAt: new Date(),
            })
            .where(eq(invoices.id, invoiceId));

          // Update payment record
          await db
            .update(payments)
            .set({
              status: 'succeeded',
              stripeChargeId: paymentIntent.latest_charge as string,
              updatedAt: new Date(),
            })
            .where(eq(payments.stripePaymentIntentId, paymentIntent.id));

          // Update lot status to sold
          const lotId = paymentIntent.metadata.lotId;
          if (lotId) {
            await db
              .update(lots)
              .set({ status: 'sold', updatedAt: new Date() })
              .where(eq(lots.id, lotId));
          }
        }
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
        }
        break;
      }

      case 'charge.refunded': {
        const charge = event.data.object as Stripe.Charge;
        const paymentIntentId = charge.payment_intent as string;

        if (paymentIntentId) {
          // Find the payment and invoice
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
          }
        }
        break;
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    logger.error('Webhook handler error', error);
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 });
  }
}
