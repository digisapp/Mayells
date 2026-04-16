import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/db';
import { users, consignments, lots } from '@/db/schema';
import { eq, sql, or, ilike } from 'drizzle-orm';
import { logger } from '@/lib/logger';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const [profile] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
    if (!profile || profile.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const search = request.nextUrl.searchParams.get('search') || '';
    const limit = Math.min(parseInt(request.nextUrl.searchParams.get('limit') || '50'), 100);
    const offset = parseInt(request.nextUrl.searchParams.get('offset') || '0');

    const searchFilter = search
      ? sql`AND (
          u.full_name ILIKE ${'%' + search + '%'}
          OR u.email ILIKE ${'%' + search + '%'}
          OR u.company_name ILIKE ${'%' + search + '%'}
        )`
      : sql``;

    const [clients, countResult] = await Promise.all([
      db.execute(sql`
        SELECT
          u.id,
          u.full_name,
          u.email,
          u.company_name,
          u.phone,
          u.created_at,
          COALESCE(c.consignment_count, 0)::int AS consignment_count,
          COALESCE(l.lot_count, 0)::int AS lot_count,
          COALESCE(l.sold_count, 0)::int AS sold_count,
          COALESCE(l.total_revenue, 0)::int AS total_revenue
        FROM users u
        LEFT JOIN (
          SELECT seller_id, COUNT(*)::int AS consignment_count
          FROM consignments
          GROUP BY seller_id
        ) c ON c.seller_id = u.id
        LEFT JOIN (
          SELECT seller_id,
            COUNT(*)::int AS lot_count,
            COUNT(*) FILTER (WHERE status = 'sold')::int AS sold_count,
            COALESCE(SUM(hammer_price) FILTER (WHERE status = 'sold'), 0)::int AS total_revenue
          FROM lots
          GROUP BY seller_id
        ) l ON l.seller_id = u.id
        WHERE (COALESCE(c.consignment_count, 0) > 0 OR COALESCE(l.lot_count, 0) > 0)
        ${searchFilter}
        ORDER BY u.full_name ASC NULLS LAST
        LIMIT ${limit} OFFSET ${offset}
      `),
      db.execute(sql`
        SELECT COUNT(*)::int AS total
        FROM users u
        LEFT JOIN (
          SELECT seller_id, COUNT(*)::int AS consignment_count FROM consignments GROUP BY seller_id
        ) c ON c.seller_id = u.id
        LEFT JOIN (
          SELECT seller_id, COUNT(*)::int AS lot_count FROM lots GROUP BY seller_id
        ) l ON l.seller_id = u.id
        WHERE (COALESCE(c.consignment_count, 0) > 0 OR COALESCE(l.lot_count, 0) > 0)
        ${searchFilter}
      `),
    ]);

    const total = (countResult[0] as { total: number })?.total ?? 0;

    return NextResponse.json({
      data: clients,
      pagination: { total, limit, offset, hasMore: offset + limit < total },
    });
  } catch (error) {
    logger.error('Admin clients error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
