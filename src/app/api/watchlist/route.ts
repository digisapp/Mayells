import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/db';
import { watchlist, lots, auctionLots } from '@/db/schema';
import { eq, and, desc, sql } from 'drizzle-orm';
import { rateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function requireUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

// GET /api/watchlist — the signed-in user's watched lots (with live lot state).
export async function GET() {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const rows = await db
      .select({
        watchId: watchlist.id,
        watchedAt: watchlist.createdAt,
        lotId: lots.id,
        title: lots.title,
        slug: lots.slug,
        primaryImageUrl: lots.primaryImageUrl,
        currentBidAmount: lots.currentBidAmount,
        estimateLow: lots.estimateLow,
        estimateHigh: lots.estimateHigh,
        status: lots.status,
        bidCount: lots.bidCount,
        closingAt: sql<string | null>`(
          SELECT MIN(${auctionLots.closingAt}) FROM ${auctionLots}
          WHERE ${auctionLots.lotId} = ${lots.id} AND ${auctionLots.closingAt} > now()
        )`,
      })
      .from(watchlist)
      .innerJoin(lots, eq(lots.id, watchlist.lotId))
      .where(eq(watchlist.userId, user.id))
      .orderBy(desc(watchlist.createdAt));

    return NextResponse.json({ data: rows }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    logger.error('Watchlist list error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/watchlist { lotId } — add a lot to the watchlist (idempotent).
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const { success } = await rateLimit(`watchlist:${user.id}`, { maxRequests: 60, windowSeconds: 60 });
    if (!success) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

    const body = await req.json().catch(() => null);
    const lotId = body?.lotId;
    if (!lotId || typeof lotId !== 'string' || !UUID_RE.test(lotId)) {
      return NextResponse.json({ error: 'A valid lotId is required' }, { status: 400 });
    }

    // Confirm the lot exists before inserting (FK would reject anyway, but a
    // clean 404 is friendlier than a 500).
    const [lot] = await db.select({ id: lots.id }).from(lots).where(eq(lots.id, lotId)).limit(1);
    if (!lot) return NextResponse.json({ error: 'Lot not found' }, { status: 404 });

    // Idempotent: the (userId, lotId) unique index makes a repeat a no-op.
    await db
      .insert(watchlist)
      .values({ userId: user.id, lotId })
      .onConflictDoNothing();

    return NextResponse.json({ data: { watching: true } }, { status: 201 });
  } catch (error) {
    logger.error('Watchlist add error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/watchlist?lotId=... — remove a lot from the watchlist.
export async function DELETE(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const lotId = req.nextUrl.searchParams.get('lotId');
    if (!lotId || !UUID_RE.test(lotId)) {
      return NextResponse.json({ error: 'A valid lotId is required' }, { status: 400 });
    }

    await db
      .delete(watchlist)
      .where(and(eq(watchlist.userId, user.id), eq(watchlist.lotId, lotId)));

    return NextResponse.json({ data: { watching: false } });
  } catch (error) {
    logger.error('Watchlist remove error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
