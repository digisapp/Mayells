import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/auth/require-admin';
import { db } from '@/db';
import { webhookLogs } from '@/db/schema';
import { eq, desc, and, or, sql, ilike, isNull, inArray } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { parsePagination } from '@/lib/pagination';

const PROVIDERS = ['stripe', 'resend'] as const;
const STATUSES = ['success', 'failed', 'ignored', 'processing'] as const;

/**
 * GET /api/admin/webhooks
 *   ?provider=stripe|resend  ?status=success|failed|ignored|processing
 *   ?eventType=payment_intent.succeeded  ?q=<event id or related id substring>
 *   ?limit  ?offset
 *
 * Lists live deliveries only (rows with no replayOfId); each row carries its
 * replays nested under `replays`, newest first, so a replayed event reads as
 * one thread instead of scattered rows. Stats are over live deliveries too;
 * `failed` counts only failures that have not since been fixed by a
 * successful replay (those are reported separately as `failed_resolved`).
 */
export async function GET(request: NextRequest) {
  try {
    const { response } = await requireAdminApi();
    if (response) return response;

    const params = request.nextUrl.searchParams;
    const provider = params.get('provider') ?? '';
    const status = params.get('status') ?? '';
    const eventType = (params.get('eventType') ?? '').trim().slice(0, 100);
    const q = (params.get('q') ?? '').trim().slice(0, 255);
    const { limit, offset } = parsePagination(params, { defaultLimit: 50, maxLimit: 100 });

    if (provider && !(PROVIDERS as readonly string[]).includes(provider)) {
      return NextResponse.json({ error: 'Unknown provider', path: 'provider' }, { status: 400 });
    }
    if (status && !(STATUSES as readonly string[]).includes(status)) {
      return NextResponse.json({ error: 'Unknown status', path: 'status' }, { status: 400 });
    }

    const conditions = [isNull(webhookLogs.replayOfId)];
    if (provider) conditions.push(eq(webhookLogs.provider, provider));
    if (status) conditions.push(eq(webhookLogs.status, status));
    if (eventType) conditions.push(eq(webhookLogs.eventType, eventType));
    if (q) {
      // Escape LIKE metacharacters so a literal `_` in an id doesn't wildcard.
      const pattern = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      conditions.push(or(ilike(webhookLogs.eventId, pattern), ilike(webhookLogs.relatedId, pattern))!);
    }
    const where = and(...conditions);

    const [logs, [{ total }], { rows: [stats] }, eventTypes] = await Promise.all([
      db
        .select()
        .from(webhookLogs)
        .where(where)
        .orderBy(desc(webhookLogs.createdAt))
        .limit(limit)
        .offset(offset),
      db.select({ total: sql<number>`count(*)::int` }).from(webhookLogs).where(where),
      // Header cards: always unfiltered, live deliveries only.
      db.execute(sql`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE w.status = 'success')::int AS success,
          COUNT(*) FILTER (WHERE w.status = 'failed' AND NOT EXISTS (
            SELECT 1 FROM webhook_logs r WHERE r.replay_of_id = w.id AND r.status = 'success'
          ))::int AS failed,
          COUNT(*) FILTER (WHERE w.status = 'failed' AND EXISTS (
            SELECT 1 FROM webhook_logs r WHERE r.replay_of_id = w.id AND r.status = 'success'
          ))::int AS failed_resolved,
          COUNT(*) FILTER (WHERE w.status = 'ignored')::int AS ignored,
          COUNT(*) FILTER (WHERE w.status = 'processing')::int AS processing,
          COUNT(*) FILTER (WHERE w.status = 'failed' AND w.created_at > now() - interval '24 hours')::int AS failed_today
        FROM webhook_logs w
        WHERE w.replay_of_id IS NULL
      `),
      db
        .selectDistinct({ provider: webhookLogs.provider, eventType: webhookLogs.eventType })
        .from(webhookLogs)
        .where(isNull(webhookLogs.replayOfId))
        .orderBy(webhookLogs.provider, webhookLogs.eventType),
    ]);

    // Attach replays to the originals on this page (one query, not N).
    const replaysByOriginal = new Map<string, typeof logs>();
    if (logs.length > 0) {
      const replays = await db
        .select()
        .from(webhookLogs)
        .where(inArray(webhookLogs.replayOfId, logs.map((l) => l.id)))
        .orderBy(desc(webhookLogs.createdAt));
      for (const r of replays) {
        const list = replaysByOriginal.get(r.replayOfId!) ?? [];
        list.push(r);
        replaysByOriginal.set(r.replayOfId!, list);
      }
    }

    return NextResponse.json({
      data: logs.map((log) => ({ ...log, replays: replaysByOriginal.get(log.id) ?? [] })),
      pagination: { total, limit, offset, hasMore: offset + limit < total },
      stats,
      eventTypes,
    });
  } catch (error) {
    logger.error('Admin webhooks fetch error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
