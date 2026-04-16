import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { auctions } from '@/db/schema';
import { inArray, desc, asc, sql, and } from 'drizzle-orm';
import { rateLimit } from '@/lib/rate-limit';

/**
 * Public Auctions API — discoverable by AI agents.
 *
 * GET /api/v1/auctions
 *
 * Query params:
 *   status — "upcoming", "live", "completed", "all" (default: "upcoming")
 *   sort   — "soonest", "newest" (default: "soonest")
 *   limit  — results per page (default 20, max 50)
 *   offset — pagination offset
 */
export async function GET(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const { success, remaining, resetAt } = await rateLimit(`v1:auctions:${ip}`, {
    maxRequests: 200,
    windowSeconds: 3600,
  });
  if (!success) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Please slow down your requests.' },
      { status: 429, headers: { 'Retry-After': String(resetAt - Math.floor(Date.now() / 1000)), 'X-RateLimit-Remaining': '0' } },
    );
  }

  const params = request.nextUrl.searchParams;

  const status = params.get('status') || 'upcoming';
  const sort = params.get('sort') || 'soonest';
  const limit = Math.min(parseInt(params.get('limit') || '20'), 50);
  const offset = parseInt(params.get('offset') || '0');

  try {
    const conditions = [];

    if (status === 'upcoming') {
      conditions.push(inArray(auctions.status, ['scheduled', 'preview', 'open']));
    } else if (status === 'live') {
      conditions.push(inArray(auctions.status, ['open', 'live']));
    } else if (status === 'completed') {
      conditions.push(inArray(auctions.status, ['closed', 'completed']));
    }

    const orderBy = sort === 'soonest'
      ? asc(auctions.biddingStartsAt)
      : desc(auctions.createdAt);

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [items, [{ count }]] = await Promise.all([
      db.select({
        id: auctions.id,
        title: auctions.title,
        subtitle: auctions.subtitle,
        description: auctions.description,
        slug: auctions.slug,
        type: auctions.type,
        status: auctions.status,
        previewStartsAt: auctions.previewStartsAt,
        biddingStartsAt: auctions.biddingStartsAt,
        biddingEndsAt: auctions.biddingEndsAt,
        coverImageUrl: auctions.coverImageUrl,
        buyerPremiumPercent: auctions.buyerPremiumPercent,
        isFeatured: auctions.isFeatured,
        lotCount: auctions.lotCount,
      })
        .from(auctions)
        .where(where)
        .orderBy(orderBy)
        .limit(limit)
        .offset(offset),
      db.select({ count: sql<number>`count(*)::int` }).from(auctions).where(where),
    ]);

    const formatted = items.map(item => ({
      ...item,
      buyerPremiumPercent: item.buyerPremiumPercent || 25,
      url: `${process.env.NEXT_PUBLIC_APP_URL}/browse/auctions/${item.slug || item.id}`,
    }));

    const response = NextResponse.json({
      data: formatted,
      pagination: { total: count, limit, offset, hasMore: offset + limit < count },
      meta: {
        provider: 'Mayells',
        apiVersion: 'v1',
        timestamp: new Date().toISOString(),
      },
    });

    response.headers.set('Access-Control-Allow-Origin', '*');
    response.headers.set('Access-Control-Allow-Methods', 'GET');
    response.headers.set('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');

    return response;
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
