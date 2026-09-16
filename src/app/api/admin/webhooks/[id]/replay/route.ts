import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/auth/require-admin';
import { db } from '@/db';
import { webhookLogs } from '@/db/schema';
import { eq, sql } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import Stripe from 'stripe';
import { handleStripeEvent } from '@/lib/stripe/handlers';
import { handleResendEvent, type ResendEvent } from '@/lib/email/resend-events';

/**
 * POST /api/admin/webhooks/:id/replay — re-run a stored event through the
 * same guarded handler as the live webhook.
 *
 * The replay's outcome is written as its own row (replayOfId → original) so a
 * failed replay is visible and a fixed failure is provable, and the original's
 * replayCount is bumped in the same transaction so the two can't drift.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { admin, response } = await requireAdminApi();
    if (response) return response;

    const { id } = await params;
    const [requested] = await db.select().from(webhookLogs).where(eq(webhookLogs.id, id)).limit(1);
    if (!requested) return NextResponse.json({ error: 'Webhook log not found' }, { status: 404 });

    // Replaying a replay row means replaying the event it was a replay of —
    // group everything under the original delivery.
    let log = requested;
    if (requested.replayOfId) {
      const [original] = await db.select().from(webhookLogs).where(eq(webhookLogs.id, requested.replayOfId)).limit(1);
      if (original) log = original;
    }

    if (log.status === 'ignored') {
      return NextResponse.json(
        { error: 'This event was ignored on delivery — there is no handler to re-run for it.' },
        { status: 409 },
      );
    }
    if (log.status === 'processing') {
      return NextResponse.json(
        { error: 'This event is still being processed by its original delivery.' },
        { status: 409 },
      );
    }
    if (log.provider === 'resend' && log.eventType === 'email.received') {
      // Inbound processing fetches the body from Resend, stores it, forwards
      // it and drafts a reply — none of which may run twice.
      return NextResponse.json({
        error: 'email.received events cannot be replayed (it would create a duplicate email record). Re-send from the Resend dashboard instead.',
      }, { status: 422 });
    }

    const startMs = Date.now();
    let status: 'success' | 'failed' | 'ignored' = 'ignored';
    let errorMessage: string | undefined;
    let relatedType: string | undefined;
    let relatedId: string | undefined;

    const payload = log.payload as Record<string, unknown>;

    try {
      if (log.provider === 'stripe') {
        // Same guarded handler as the live webhook — amount/currency checks,
        // payable-status transitions and partial-refund rules all apply.
        const result = await handleStripeEvent(payload as unknown as Stripe.Event);
        status = result.status;
        relatedType = result.relatedType;
        relatedId = result.relatedId;
      } else if (log.provider === 'resend') {
        const result = await handleResendEvent(payload as unknown as ResendEvent);
        status = result.status;
        relatedType = result.relatedType;
        relatedId = result.relatedId;
      } else {
        return NextResponse.json({ error: `Unknown provider "${log.provider}"` }, { status: 422 });
      }
    } catch (err) {
      status = 'failed';
      errorMessage = err instanceof Error ? err.message : String(err);
    }

    const processingMs = Date.now() - startMs;

    // Replay row + counter bump atomically. Replay rows carry no eventId (the
    // original owns the (provider, event_id) identity, and the dedup index
    // would otherwise collide), so nothing here can fail on uniqueness.
    await db.transaction(async (tx) => {
      await tx.insert(webhookLogs).values({
        provider: log.provider,
        eventType: log.eventType,
        eventId: null,
        status,
        errorMessage: errorMessage ?? null,
        processingMs,
        payload,
        relatedType: relatedType ?? log.relatedType,
        relatedId: relatedId ?? log.relatedId,
        replayOfId: log.id,
      });
      await tx.update(webhookLogs).set({
        replayCount: sql`${webhookLogs.replayCount} + 1`,
        lastReplayedAt: new Date(),
      }).where(eq(webhookLogs.id, log.id));
    });

    logger.info('Webhook event replayed', {
      logId: log.id, provider: log.provider, eventType: log.eventType, status, by: admin.id,
    });

    return NextResponse.json({ replayed: true, status, errorMessage: errorMessage ?? null });
  } catch (error) {
    logger.error('Webhook replay error', error);
    return NextResponse.json({ error: 'Replay failed' }, { status: 500 });
  }
}
