import { eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { webhookLogs } from '@/db/schema';
import { logger } from '@/lib/logger';

export type WebhookProvider = 'stripe' | 'resend';
export type WebhookOutcomeStatus = 'success' | 'failed' | 'ignored';

/**
 * A claim older than this that is still `processing` is treated as abandoned
 * (the function crashed or timed out before `finalizeWebhookLog` ran) and may
 * be reclaimed by a redelivery. Well above any serverless max duration.
 */
const STALE_PROCESSING_MINUTES = 10;

export interface WebhookClaim {
  provider: WebhookProvider;
  /** Provider event id (Stripe `evt_…`, Svix `msg_…`). Null when the provider sent none. */
  eventId: string | null;
  eventType: string;
  payload: unknown;
}

export type WebhookClaimResult =
  | { claimed: true; id: string }
  /** Another delivery of this event already succeeded, was ignored, or is in flight right now. */
  | { claimed: false };

/**
 * Log FIRST, then process: insert-or-update-if-failed.
 *
 * The `(provider, event_id)` partial unique index makes this the atomic dedup
 * for concurrent and repeated deliveries — two deliveries racing can only
 * claim one row. What makes the failure count truthful is the ON CONFLICT
 * branch: a redelivery of an event whose earlier attempt `failed` (or whose
 * claim went stale) takes the existing row over in place — status back to
 * `processing`, `createdAt = now()` so it sorts as the latest attempt — instead
 * of being dropped as a duplicate and leaving "failed" on the board forever.
 * A row that is `success`/`ignored`/freshly `processing` is left alone and the
 * caller must treat the delivery as a duplicate.
 *
 * Throws on a database error: without the claim there is no dedup, so the
 * caller must not process (the provider will retry).
 */
export async function claimWebhookEvent(claim: WebhookClaim): Promise<WebhookClaimResult> {
  const values = {
    provider: claim.provider,
    eventType: claim.eventType,
    eventId: claim.eventId,
    status: 'processing',
    payload: claim.payload as Record<string, unknown>,
  };

  if (!claim.eventId) {
    // No provider id → nothing to dedup against; every delivery is its own row.
    const [row] = await db.insert(webhookLogs).values(values).returning({ id: webhookLogs.id });
    return { claimed: true, id: row.id };
  }

  const [row] = await db
    .insert(webhookLogs)
    .values(values)
    .onConflictDoUpdate({
      target: [webhookLogs.provider, webhookLogs.eventId],
      targetWhere: sql`${webhookLogs.eventId} is not null`,
      set: {
        status: 'processing',
        eventType: values.eventType,
        payload: values.payload,
        errorMessage: null,
        processingMs: null,
        createdAt: sql`now()`,
      },
      setWhere: sql`${webhookLogs.status} = 'failed' or (${webhookLogs.status} = 'processing' and ${webhookLogs.createdAt} < now() - make_interval(mins => ${STALE_PROCESSING_MINUTES}::int))`,
    })
    .returning({ id: webhookLogs.id });

  return row ? { claimed: true, id: row.id } : { claimed: false };
}

export interface WebhookOutcome {
  status: WebhookOutcomeStatus;
  errorMessage?: string | null;
  processingMs: number;
  relatedType?: string | null;
  relatedId?: string | null;
}

/**
 * Record how a claimed delivery ended. Never throws: a webhook that was
 * handled must not 500 because its audit row could not be written (the
 * provider would retry a side effect that already happened). A row left in
 * `processing` by such a failure becomes reclaimable after
 * STALE_PROCESSING_MINUTES.
 */
export async function finalizeWebhookLog(id: string, outcome: WebhookOutcome): Promise<void> {
  try {
    await db
      .update(webhookLogs)
      .set({
        status: outcome.status,
        errorMessage: outcome.errorMessage ?? null,
        processingMs: outcome.processingMs,
        relatedType: outcome.relatedType ?? null,
        relatedId: outcome.relatedId ?? null,
      })
      .where(eq(webhookLogs.id, id));
  } catch (err) {
    logger.warn('Failed to finalize webhook log', { err: String(err), logId: id, status: outcome.status });
  }
}
