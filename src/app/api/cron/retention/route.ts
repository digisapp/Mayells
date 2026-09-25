import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { and, inArray, isNotNull, lt, eq } from 'drizzle-orm';
import { db } from '@/db';
import { siteEvents, webhookLogs } from '@/db/schema';
import { logger } from '@/lib/logger';

/**
 * Daily housekeeping for the two tables that only ever grow.
 *
 * webhook_logs keeps the full Stripe/Resend event as jsonb, and the admin
 * webhooks page scans it on every refresh. Failed deliveries are kept whole
 * (they are what the replay button needs); successful ones lose their
 * payload after 30 days and the row after 90. Traffic events (site_events,
 * mayells.com and the city sites) are kept for 13 months so the
 * year-over-year view still has last season.
 */

const CRON_SECRET = process.env.CRON_SECRET;
const DAY = 24 * 60 * 60 * 1000;

function isAuthorized(request: NextRequest): boolean {
  if (!CRON_SECRET) return false;
  const expected = Buffer.from(`Bearer ${CRON_SECRET}`);
  const provided = Buffer.from(request.headers.get('authorization') ?? '');
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = Date.now();
  try {
    const deletedWebhooks = await db
      .delete(webhookLogs)
      .where(and(lt(webhookLogs.createdAt, new Date(now - 90 * DAY)), inArray(webhookLogs.status, ['success', 'ignored'])))
      .returning({ id: webhookLogs.id });

    const trimmedPayloads = await db
      .update(webhookLogs)
      .set({ payload: null })
      .where(and(lt(webhookLogs.createdAt, new Date(now - 30 * DAY)), eq(webhookLogs.status, 'success'), isNotNull(webhookLogs.payload)))
      .returning({ id: webhookLogs.id });

    const deletedEvents = await db
      .delete(siteEvents)
      .where(lt(siteEvents.createdAt, new Date(now - 395 * DAY)))
      .returning({ id: siteEvents.id });

    const result = {
      webhookLogsDeleted: deletedWebhooks.length,
      webhookPayloadsTrimmed: trimmedPayloads.length,
      siteEventsDeleted: deletedEvents.length,
    };
    logger.info('Retention sweep done', result);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    logger.error('Retention sweep failed', error);
    return NextResponse.json({ error: 'Retention sweep failed' }, { status: 500 });
  }
}
