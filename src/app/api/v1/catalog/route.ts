import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { lots, categories } from '@/db/schema';
import { eq, and, gte, lte, ilike, inArray, desc, asc, sql, or } from 'drizzle-orm';
import { rateLimit } from '@/lib/rate-limit';

/**
 * Public Catalog API — discoverable by AI agents, search engines, and third-party tools.
 *
 * GET /api/v1/catalog
 *
 * Query params:
 *   category    — filter by category slug (e.g., "jewelry", "art")
 *   query       — search title, description, artist
 *   minEstimate — minimum estimate in USD (not cents)
 *   maxEstimate — maximum estimate in USD (not cents)
 *   status      — "available" (default), "sold", "all"
 *   saleType    — "auction", "gallery", "all" (default: "all")
 *   sort        — "newest", "ending_soon", "price_asc", "price_desc", "estimate_asc", "estimate_desc"
 *   limit       — results per page (default 50, max 100)
 *   offset      — pagination offset
 */
export async function GET(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const { success, remaining, resetAt } = await rateLimit(`v1:catalog:${ip}`, {
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

  const categorySlug = params.get('category');
  const query = params.get('query');
  const minEstimate = params.get('minEstimate') ? parseInt(params.get('minEstimate')!) * 100 : undefined;
  const maxEstimate = params.get('maxEstimate') ? parseInt(params.get('maxEstimate')!) * 100 : undefined;
  const status = params.get('status') || 'available';
  const saleType = params.get('saleType') || 'all';
  const sort = params.get('sort') || 'newest';
  const limit = Math.min(parseInt(params.get('limit') || '50'), 100);
  const offset = parseInt(params.get('offset') || '0');

  try {
    const conditions = [];

    // Status filter
    if (status === 'available') {
      conditions.push(inArray(lots.status, ['for_sale', 'in_auction', 'approved']));
    } else if (status === 'sold') {
      conditions.push(eq(lots.status, 'sold'));
    }
    // "all" = no status filter

    // Sale type
    if (saleType !== 'all') {
      conditions.push(eq(lots.saleType, saleType as 'auction' | 'gallery' | 'private'));
    }

    // Category
    if (categorySlug) {
      const [cat] = await db.select().from(categories).where(eq(categories.slug, categorySlug)).limit(1);
      if (cat) {
        conditions.push(eq(lots.categoryId, cat.id));
      }
    }

    // Price/estimate range
    if (minEstimate) conditions.push(gte(lots.estimateHigh, minEstimate));
    if (maxEstimate) conditions.push(lte(lots.estimateLow, maxEstimate));

    // Text search
    if (query) {
      conditions.push(
        or(
          ilike(lots.title, `%${query}%`),
          ilike(lots.description, `%${query}%`),
          ilike(lots.artist, `%${query}%`),
          ilike(lots.maker, `%${query}%`),
        )!
      );
    }

    // Sort
    const orderBy = {
      newest: desc(lots.createdAt),
      ending_soon: asc(lots.createdAt), // TODO: sort by auction end time when lots are joined to auctions
      price_asc: asc(lots.currentBidAmount),
      price_desc: desc(lots.currentBidAmount),
      estimate_asc: asc(lots.estimateLow),
      estimate_desc: desc(lots.estimateHigh),
    }[sort] || desc(lots.createdAt);

    // Query
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [items, [{ count }]] = await Promise.all([
      db.select({
        id: lots.id,
        title: lots.title,
        subtitle: lots.subtitle,
        description: lots.description,
        artist: lots.artist,
        maker: lots.maker,
        period: lots.period,
        circa: lots.circa,
        origin: lots.origin,
        medium: lots.medium,
        dimensions: lots.dimensions,
        condition: lots.condition,
        conditionNotes: lots.conditionNotes,
        provenance: lots.provenance,
        status: lots.status,
        saleType: lots.saleType,
        estimateLow: lots.estimateLow,
        estimateHigh: lots.estimateHigh,
        currentBid: lots.currentBidAmount,
        bidCount: lots.bidCount,
        buyNowPrice: lots.buyNowPrice,
        hammerPrice: lots.hammerPrice,
        primaryImageUrl: lots.primaryImageUrl,
        imageCount: lots.imageCount,
        slug: lots.slug,
        tags: lots.aiTags,
        categoryId: lots.categoryId,
        createdAt: lots.createdAt,
      })
        .from(lots)
        .where(where)
        .orderBy(orderBy)
        .limit(limit)
        .offset(offset),
      db.select({ count: sql<number>`count(*)::int` }).from(lots).where(where),
    ]);

    // Format prices from cents to dollars for API consumers
    const formatted = items.map(item => ({
      ...item,
      estimateLow: item.estimateLow ? item.estimateLow / 100 : null,
      estimateHigh: item.estimateHigh ? item.estimateHigh / 100 : null,
      currentBid: item.currentBid ? item.currentBid / 100 : null,
      buyNowPrice: item.buyNowPrice ? item.buyNowPrice / 100 : null,
      hammerPrice: item.hammerPrice ? item.hammerPrice / 100 : null,
      currency: 'USD',
      url: `${process.env.NEXT_PUBLIC_APP_URL}/browse/lots/${item.slug || item.id}`,
    }));

    const response = NextResponse.json({
      data: formatted,
      pagination: { total: count, limit, offset, hasMore: offset + limit < count },
      meta: {
        provider: 'Mayell Auctions',
        apiVersion: 'v1',
        timestamp: new Date().toISOString(),
      },
    });

    // Allow CORS for AI agents
    response.headers.set('Access-Control-Allow-Origin', '*');
    response.headers.set('Access-Control-Allow-Methods', 'GET');
    response.headers.set('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');

    return response;
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
