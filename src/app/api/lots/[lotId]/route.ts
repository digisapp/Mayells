import { NextRequest, NextResponse } from 'next/server';
import { isAdminProfile } from '@/lib/auth/admin';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/db';
import { lots, lotImages, bids, users } from '@/db/schema';
import { eq, desc, sql } from 'drizzle-orm';
import { lotUpdateSchema } from '@/lib/validation/schemas';
import { logger } from '@/lib/logger';
import type { Lot, Bid } from '@/db/schema';

/**
 * Public-safe projection of a lot. Excludes auction-integrity and PII fields:
 * reservePrice, sellerId, consignmentId, currentBidderId, winnerId, and
 * internal AI valuation fields.
 */
function toPublicLot(lot: Lot) {
  return {
    id: lot.id,
    lotNumber: lot.lotNumber,
    title: lot.title,
    subtitle: lot.subtitle,
    description: lot.description,
    categoryId: lot.categoryId,
    subcategoryId: lot.subcategoryId,
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
    buyNowPrice: lot.buyNowPrice,
    estimateLow: lot.estimateLow,
    estimateHigh: lot.estimateHigh,
    startingBid: lot.startingBid,
    currentBidAmount: lot.currentBidAmount,
    bidCount: lot.bidCount,
    hammerPrice: lot.hammerPrice,
    primaryImageUrl: lot.primaryImageUrl,
    imageCount: lot.imageCount,
    isFeatured: lot.isFeatured,
    isHighlight: lot.isHighlight,
    aiTags: lot.aiTags,
    slug: lot.slug,
    createdAt: lot.createdAt,
    updatedAt: lot.updatedAt,
  };
}

/**
 * Public-safe bid history: amount, time, and a stable anonymized bidder
 * label only (no bidderId, maxBidAmount, ipAddress, or userAgent).
 */
function toPublicBidHistory(bidRows: Bid[]) {
  const labels = new Map<string, string>();
  // Assign labels in chronological order so "Bidder 1" is the first bidder
  for (const bid of [...bidRows].reverse()) {
    if (!labels.has(bid.bidderId)) {
      labels.set(bid.bidderId, `Bidder ${labels.size + 1}`);
    }
  }
  return bidRows.map((bid) => ({
    amount: bid.amount,
    createdAt: bid.createdAt,
    bidder: labels.get(bid.bidderId) ?? 'Bidder',
  }));
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ lotId: string }> },
) {
  try {
    const { lotId } = await params;

    let [lot] = await db
      .select()
      .from(lots)
      .where(eq(lots.id, lotId))
      .limit(1);

    if (!lot) {
      // Try by slug
      [lot] = await db
        .select()
        .from(lots)
        .where(eq(lots.slug, lotId))
        .limit(1);
    }

    if (!lot) {
      return NextResponse.json({ error: 'Lot not found' }, { status: 404 });
    }

    const images = await db
      .select()
      .from(lotImages)
      .where(eq(lotImages.lotId, lot.id))
      .orderBy(lotImages.sortOrder);

    const bidRows = await db
      .select()
      .from(bids)
      .where(eq(bids.lotId, lot.id))
      .orderBy(desc(bids.createdAt))
      .limit(20);

    // Admins (e.g. the admin lot editor) get the full row including
    // reservePrice and raw bid data; everyone else gets a public-safe shape.
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    // This response varies by auth (admins get reservePrice + raw bids), so it
    // must never be stored in a shared/CDN cache keyed only by URL — otherwise
    // an admin-cached full-detail payload could be served to anonymous users.
    const noStore = { 'Cache-Control': 'private, no-store', Vary: 'Cookie' };
    if (user) {
      const [profile] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
      if (isAdminProfile(profile)) {
        return NextResponse.json({ data: { ...lot, images, bidHistory: bidRows } }, { headers: noStore });
      }
    }

    return NextResponse.json({
      data: { ...toPublicLot(lot), images, bidHistory: toPublicBidHistory(bidRows) },
    }, { headers: noStore });
  } catch (error) {
    logger.error('Get lot error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ lotId: string }> },
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const [profile] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
    if (!profile || !isAdminProfile(profile)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { lotId } = await params;
    const body = await req.json();
    const parsed = lotUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const [updated] = await db
      .update(lots)
      .set({ ...parsed.data, updatedAt: sql`now()` })
      .where(eq(lots.id, lotId))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: 'Lot not found' }, { status: 404 });
    }

    return NextResponse.json({ data: updated });
  } catch (error) {
    logger.error('Update lot error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ lotId: string }> },
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const [profile] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
    if (!profile || !isAdminProfile(profile)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { lotId } = await params;

    const [lot] = await db.select().from(lots).where(eq(lots.id, lotId)).limit(1);
    if (!lot) {
      return NextResponse.json({ error: 'Lot not found' }, { status: 404 });
    }

    if (lot.status === 'in_auction' || lot.status === 'sold') {
      return NextResponse.json(
        { error: `Cannot delete a lot that is ${lot.status.replace('_', ' ')}` },
        { status: 400 },
      );
    }

    await db.delete(lots).where(eq(lots.id, lotId));
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Delete lot error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
