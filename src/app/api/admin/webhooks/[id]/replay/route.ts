import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/db';
import { webhookLogs, users, emails } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import Stripe from 'stripe';
import { handleStripeEvent } from '@/lib/stripe/handlers';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const [profile] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
    if (!profile || profile.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;
    const [log] = await db.select().from(webhookLogs).where(eq(webhookLogs.id, id)).limit(1);
    if (!log) return NextResponse.json({ error: 'Webhook log not found' }, { status: 404 });

    const startMs = Date.now();
    let status: 'success' | 'failed' | 'ignored' = 'ignored';
    let errorMessage: string | undefined;
    let relatedType: string | undefined;
    let relatedId: string | undefined;

    const payload = log.payload as Record<string, unknown>;

    try {
      if (log.provider === 'stripe') {
        // Replay through the SAME guarded handler as the live webhook — so a
        // replayed event honours amount/currency verification, payable-status
        // transitions, and partial-refund rules instead of blindly re-applying
        // financial mutations.
        const event = payload as unknown as Stripe.Event;
        const result = await handleStripeEvent(event);
        status = result.status;
        relatedType = result.relatedType;
        relatedId = result.relatedId;
      } else if (log.provider === 'resend') {
        const { type, data } = payload as { type: string; data: Record<string, unknown> };

        if (type === 'email.delivered' && data?.email_id) {
          await db.update(emails).set({ status: 'delivered' })
            .where(eq(emails.resendId, data.email_id as string));
          relatedType = 'email';
          relatedId = data.email_id as string;
          status = 'success';
        } else if (type === 'email.bounced' && data?.email_id) {
          await db.update(emails).set({ status: 'bounced' })
            .where(eq(emails.resendId, data.email_id as string));
          relatedType = 'email';
          relatedId = data.email_id as string;
          status = 'success';
        } else if (type === 'email.received') {
          // email.received replays require re-fetching from Resend — not safe to replay
          return NextResponse.json({
            error: 'email.received events cannot be replayed (would create duplicate email records). Re-process from Resend dashboard instead.',
          }, { status: 422 });
        } else {
          status = 'ignored';
        }
      }
    } catch (err) {
      status = 'failed';
      errorMessage = err instanceof Error ? err.message : String(err);
    }

    // Write a new log entry for the replay
    await db.insert(webhookLogs).values({
      provider: log.provider,
      eventType: log.eventType,
      eventId: log.eventId ? `replay:${log.eventId}` : null,
      status,
      errorMessage: errorMessage ?? null,
      processingMs: Date.now() - startMs,
      payload,
      relatedType: relatedType ?? log.relatedType,
      relatedId: relatedId ?? log.relatedId,
    });

    // Increment replay count on the original
    await db.update(webhookLogs).set({
      replayCount: (log.replayCount ?? 0) + 1,
      lastReplayedAt: new Date(),
    }).where(eq(webhookLogs.id, id));

    return NextResponse.json({ replayed: true, status });
  } catch (error) {
    logger.error('Webhook replay error', error);
    return NextResponse.json({ error: 'Replay failed' }, { status: 500 });
  }
}
