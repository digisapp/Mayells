import { NextRequest, NextResponse } from 'next/server';
import { isAdminProfile } from '@/lib/auth/admin';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/db';
import { lots, lotImages, bids, users } from '@/db/schema';
import { eq, desc, sql, or } from 'drizzle-orm';
import { lotUpdateSchema } from '@/lib/validation/schemas';
import { toPublicLot, isPubliclyVisibleLot } from '@/lib/lots/visibility';
import { UUID_RE } from '@/lib/bidding/lot-resolution';
import { revalidatePublicCatalog } from '@/lib/revalidate';
import { logger } from '@/lib/logger';
import type { Bid } from '@/db/schema';

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

    // Accept a UUID or a slug. Comparing a non-UUID string against the uuid
    // column throws in Postgres (22P02), so only include the id match when
    // the param actually looks like one.
    const [lot] = await db
      .select()
      .from(lots)
      .where(UUID_RE.test(lotId) ? or(eq(lots.id, lotId), eq(lots.slug, lotId)) : eq(lots.slug, lotId))
      .limit(1);

    if (!lot) {
      return NextResponse.json({ error: 'Lot not found' }, { status: 404 });
    }

    // Admins (e.g. the admin lot editor) get the full row including
    // reservePrice and raw bid data; everyone else gets a public-safe shape,
    // and can't see unpublished lots (draft / pending_review / withdrawn) at all.
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    let isAdmin = false;
    if (user) {
      const [profile] = await db
        .select({ role: users.role, isAdmin: users.isAdmin })
        .from(users)
        .where(eq(users.id, user.id))
        .limit(1);
      isAdmin = isAdminProfile(profile);
    }

    if (!isAdmin && !isPubliclyVisibleLot(lot.status)) {
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

    // This response varies by auth (admins get reservePrice + raw bids), so it
    // must never be stored in a shared/CDN cache keyed only by URL — otherwise
    // an admin-cached full-detail payload could be served to anonymous users.
    const noStore = { 'Cache-Control': 'private, no-store', Vary: 'Cookie' };
    if (isAdmin) {
      return NextResponse.json({ data: { ...lot, images, bidHistory: bidRows } }, { headers: noStore });
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
    if (!UUID_RE.test(lotId)) {
      return NextResponse.json({ error: 'Lot not found' }, { status: 404 });
    }
    const body = await req.json();
    const parsed = lotUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const updated = await db.transaction(async (tx) => {
      const [row] = await tx
        .update(lots)
        .set({ ...parsed.data, updatedAt: sql`now()` })
        .where(eq(lots.id, lotId))
        .returning();

      // Keep lot_images.isPrimary in sync with the lot's primaryImageUrl so
      // the primary flag survives reload and image DELETE sees true state.
      if (row && parsed.data.primaryImageUrl) {
        await tx
          .update(lotImages)
          .set({ isPrimary: sql`(${lotImages.url} = ${parsed.data.primaryImageUrl})` })
          .where(eq(lotImages.lotId, lotId));
      }

      return row;
    });

    if (!updated) {
      return NextResponse.json({ error: 'Lot not found' }, { status: 404 });
    }

    revalidatePublicCatalog();
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
    if (!UUID_RE.test(lotId)) {
      return NextResponse.json({ error: 'Lot not found' }, { status: 404 });
    }

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
    revalidatePublicCatalog();
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Delete lot error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
