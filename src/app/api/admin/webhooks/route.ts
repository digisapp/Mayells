import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/db';
import { webhookLogs, users } from '@/db/schema';
import { eq, desc, and, sql } from 'drizzle-orm';
import { logger } from '@/lib/logger';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const [profile] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
    if (!profile || profile.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const params = request.nextUrl.searchParams;
    const provider = params.get('provider'); // 'stripe' | 'resend'
    const status = params.get('status');     // 'success' | 'failed' | 'ignored'
    const limit = Math.min(parseInt(params.get('limit') || '50'), 100);
    const offset = parseInt(params.get('offset') || '0');

    const conditions = [];
    if (provider) conditions.push(eq(webhookLogs.provider, provider));
    if (status) conditions.push(eq(webhookLogs.status, status));

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [logs, [{ total }]] = await Promise.all([
      db
        .select()
        .from(webhookLogs)
        .where(where)
        .orderBy(desc(webhookLogs.createdAt))
        .limit(limit)
        .offset(offset),
      db.select({ total: sql<number>`count(*)::int` }).from(webhookLogs).where(where),
    ]);

    // Stats summary (always unfiltered for the header cards)
    const [stats] = await db.execute(sql`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status = 'success')::int AS success,
        COUNT(*) FILTER (WHERE status = 'failed')::int AS failed,
        COUNT(*) FILTER (WHERE status = 'ignored')::int AS ignored,
        COUNT(*) FILTER (WHERE status = 'failed' AND created_at > now() - interval '24 hours')::int AS failed_today
      FROM webhook_logs
    `);

    return NextResponse.json({
      data: logs,
      pagination: { total, limit, offset, hasMore: offset + limit < total },
      stats,
    });
  } catch (error) {
    logger.error('Admin webhooks fetch error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
