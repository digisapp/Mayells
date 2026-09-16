import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe/config';
import Stripe from 'stripe';
import { logger } from '@/lib/logger';
import { handleStripeEvent } from '@/lib/stripe/handlers';
import { claimWebhookEvent, finalizeWebhookLog } from '@/lib/webhooks/log';

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
if (!webhookSecret) {
  // Loud at startup, not just per request: without the secret every Stripe
  // delivery is rejected below, which means paid invoices never get marked
  // paid and no payout/shipment is created.
  logger.error('STRIPE_WEBHOOK_SECRET is not configured — Stripe webhooks will be rejected');
}

export async function POST(request: NextRequest) {
  // Fail closed: without the secret we cannot verify events, so never process.
  if (!webhookSecret) {
    logger.error('STRIPE_WEBHOOK_SECRET is not configured — rejecting Stripe webhook');
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 503 });
  }

  const body = await request.text();
  const signature = request.headers.get('stripe-signature') ?? '';

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    logger.error('Webhook signature verification failed', err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Log FIRST. The (provider, event_id) unique index makes the claim the
  // atomic dedup: a concurrent duplicate delivery loses the insert instead of
  // both being processed, and a redelivery of an event that previously
  // `failed` takes that row over so the failure count stays truthful.
  const claim = await claimWebhookEvent({
    provider: 'stripe',
    eventId: event.id,
    eventType: event.type,
    payload: event,
  });
  if (!claim.claimed) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  const startMs = Date.now();
  let status: 'success' | 'failed' | 'ignored' = 'ignored';
  let errorMessage: string | undefined;
  let relatedType: string | undefined;
  let relatedId: string | undefined;

  try {
    const result = await handleStripeEvent(event);
    status = result.status;
    relatedType = result.relatedType;
    relatedId = result.relatedId;
  } catch (error) {
    logger.error('Webhook handler error', error);
    status = 'failed';
    errorMessage = error instanceof Error ? error.message : String(error);
  } finally {
    // Must be awaited: the claimed row is the dedup record, and a row left in
    // `processing` blocks redelivery until it goes stale. Never throws.
    await finalizeWebhookLog(claim.id, {
      status,
      errorMessage,
      processingMs: Date.now() - startMs,
      relatedType,
      relatedId,
    });
  }

  if (status === 'failed') {
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 });
  }
  return NextResponse.json({ received: true });
}
