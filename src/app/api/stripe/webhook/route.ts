import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe/config';
import { db } from '@/db';
import { webhookLogs } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import Stripe from 'stripe';
import { logger } from '@/lib/logger';
import { handleStripeEvent } from '@/lib/stripe/handlers';

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
    const result = await handleStripeEvent(event);
    status = result.status;
    relatedType = result.relatedType;
    relatedId = result.relatedId;
  } catch (error) {
    logger.error('Webhook handler error', error);
    status = 'failed';
    errorMessage = error instanceof Error ? error.message : String(error);
  } finally {
    // Persist log — this is the dedup record, so it must be awaited. The
    // (provider, event_id) unique index makes this the atomic dedup backstop:
    // a concurrent duplicate delivery that raced past the select above loses
    // the insert here (DO NOTHING) instead of crashing with a duplicate-key
    // 500. The event handlers are idempotent, so a lost log is harmless.
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
      }).onConflictDoNothing();
    } catch (err) {
      logger.warn('Failed to persist webhook log', { err: String(err) });
    }
  }

  if (status === 'failed') {
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 });
  }
  return NextResponse.json({ received: true });
}
