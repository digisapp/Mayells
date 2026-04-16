import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { lots } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { rateLimit } from '@/lib/rate-limit';

/**
 * Public Lot Detail API — full lot information for AI agents.
 *
 * GET /api/v1/lots/:lotId
 *
 * Accepts lot ID (UUID) or slug.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ lotId: string }> }
) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const { success, resetAt } = await rateLimit(`v1:lots:${ip}`, {
    maxRequests: 300,
    windowSeconds: 3600,
  });
  if (!success) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Please slow down your requests.' },
      { status: 429, headers: { 'Retry-After': String(resetAt - Math.floor(Date.now() / 1000)), 'X-RateLimit-Remaining': '0' } },
    );
  }

  const { lotId } = await params;

  try {
    // Try by slug first, then by ID
    let lot = await db.query.lots.findFirst({
      where: eq(lots.slug, lotId),
      with: {
        category: true,
        images: true,
      },
    });

    if (!lot) {
      lot = await db.query.lots.findFirst({
        where: eq(lots.id, lotId),
        with: {
          category: true,
          images: true,
        },
      });
    }

    if (!lot) {
      return NextResponse.json({ error: 'Lot not found' }, { status: 404 });
    }

    const formatted = {
      id: lot.id,
      title: lot.title,
      subtitle: lot.subtitle,
      description: lot.description,
      artist: lot.artist,
      maker: lot.maker,
      period: lot.period,
      circa: lot.circa,
      origin: lot.origin,
      medium: lot.medium,
      dimensions: lot.dimensions,
      weight: lot.weight,
      condition: lot.condition,
      conditionNotes: lot.conditionNotes,
      provenance: lot.provenance,
      literature: lot.literature,
      exhibited: lot.exhibited,
      status: lot.status,
      saleType: lot.saleType,
      category: lot.category ? {
        id: lot.category.id,
        name: lot.category.name,
        slug: lot.category.slug,
      } : null,
      pricing: {
        currency: 'USD',
        estimateLow: lot.estimateLow ? lot.estimateLow / 100 : null,
        estimateHigh: lot.estimateHigh ? lot.estimateHigh / 100 : null,
        currentBid: lot.currentBidAmount ? lot.currentBidAmount / 100 : null,
        bidCount: lot.bidCount,
        buyNowPrice: lot.buyNowPrice ? lot.buyNowPrice / 100 : null,
        hammerPrice: lot.hammerPrice ? lot.hammerPrice / 100 : null,
      },
      images: lot.images?.map((img: { id: string; url: string; isPrimary?: boolean | null }) => ({
        id: img.id,
        url: img.url,
        isPrimary: img.isPrimary,
      })) || [],
      primaryImageUrl: lot.primaryImageUrl,
      tags: lot.aiTags,
      isFeatured: lot.isFeatured,
      slug: lot.slug,
      url: `${process.env.NEXT_PUBLIC_APP_URL}/browse/lots/${lot.slug || lot.id}`,
      createdAt: lot.createdAt,
    };

    const response = NextResponse.json({
      data: formatted,
      meta: {
        provider: 'Mayells',
        apiVersion: 'v1',
        timestamp: new Date().toISOString(),
      },
    });

    response.headers.set('Access-Control-Allow-Origin', '*');
    response.headers.set('Access-Control-Allow-Methods', 'GET');
    response.headers.set('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=120');

    return response;
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
