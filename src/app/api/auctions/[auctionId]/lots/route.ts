import { NextRequest, NextResponse } from 'next/server';
import { isAdminProfile } from '@/lib/auth/admin';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/db';
import { auctionLots, lots, auctions, users } from '@/db/schema';
import { eq, asc, sql, and, inArray, or } from 'drizzle-orm';
import { assignLotSchema } from '@/lib/validation/schemas';
import { initializeLotBidState } from '@/lib/bidding/bid-engine';
import { LIVE_FALLBACK_CLOSE_MS } from '@/lib/bidding/lifecycle';
import { UUID_RE } from '@/lib/bidding/lot-resolution';
import { isPubliclyVisibleAuction } from '@/lib/auctions/visibility';
import { PUBLIC_LOT_STATUSES, toPublicLot } from '@/lib/lots/visibility';
import { revalidatePublicCatalog } from '@/lib/revalidate';
import { logger } from '@/lib/logger';

/** True when the caller is an authenticated admin (errors count as anonymous). */
async function callerIsAdmin(): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;
    const [profile] = await db
      .select({ role: users.role, isAdmin: users.isAdmin })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);
    return isAdminProfile(profile);
  } catch {
    return false;
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ auctionId: string }> },
) {
  try {
    const { auctionId } = await params;

    // Find auction by ID or slug (only compare against the uuid column when
    // the param looks like a UUID — otherwise Postgres throws 22P02).
    const [auction] = await db
      .select()
      .from(auctions)
      .where(
        UUID_RE.test(auctionId)
          ? or(eq(auctions.id, auctionId), eq(auctions.slug, auctionId))
          : eq(auctions.slug, auctionId),
      )
      .limit(1);

    if (!auction) {
      return NextResponse.json({ error: 'Auction not found' }, { status: 404 });
    }

    // Public callers only see publicly-listable lots and the safe projection;
    // a draft/withdrawn lot assigned to an auction ahead of publication must
    // not be visible (nor its reservePrice) until it goes live. Admin callers
    // (the auction editor) see everything. A draft/cancelled auction's lot
    // list is not public at all.
    const isAdmin = await callerIsAdmin();
    if (!isAdmin && !isPubliclyVisibleAuction(auction.status)) {
      return NextResponse.json({ error: 'Auction not found' }, { status: 404 });
    }

    const result = await db
      .select({
        auctionLot: auctionLots,
        lot: lots,
      })
      .from(auctionLots)
      .innerJoin(lots, eq(auctionLots.lotId, lots.id))
      .where(
        isAdmin
          ? eq(auctionLots.auctionId, auction.id)
          : and(
              eq(auctionLots.auctionId, auction.id),
              inArray(lots.status, [...PUBLIC_LOT_STATUSES]),
            ),
      )
      .orderBy(asc(auctionLots.lotNumber));

    const lotsWithNumbers = result.map(({ auctionLot, lot }) => ({
      ...(isAdmin ? lot : toPublicLot(lot)),
      lotNumber: auctionLot.lotNumber,
      closingAt: auctionLot.closingAt,
    }));

    return NextResponse.json(
      { data: lotsWithNumbers },
      { headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie' } },
    );
  } catch (error) {
    logger.error('Auction lots error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ auctionId: string }> },
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

    const { auctionId } = await params;
    if (!UUID_RE.test(auctionId)) {
      return NextResponse.json({ error: 'Auction not found' }, { status: 404 });
    }
    const body = await req.json();
    const parsed = assignLotSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const [auction] = await db.select().from(auctions).where(eq(auctions.id, auctionId)).limit(1);
    if (!auction) {
      return NextResponse.json({ error: 'Auction not found' }, { status: 404 });
    }

    // If the auction is already live/open, a newly-assigned lot must get a
    // close time so it can be settled, and its Redis bid state must be seeded —
    // otherwise every bid on it is rejected with STATE_MISSING ("Bidding is
    // not open for this lot"). The cron's open step only runs once, at the
    // scheduled→open transition, so it never covers lots added afterward.
    //
    // A live-type auction commonly has no biddingEndsAt (openAuctionLots seeds
    // its lots with a 12h fallback close); mirror that here so a lot added
    // mid-session is actually biddable and forceCloseAuctionLots (which filters
    // on a non-null closingAt) can close it when the auctioneer ends the sale.
    const isAuctionLive = auction.status === 'open' || auction.status === 'live';
    const closingAt = !isAuctionLive
      ? null
      : auction.biddingEndsAt
        ? auction.biddingEndsAt
        : auction.type === 'live'
          ? new Date(Date.now() + LIVE_FALLBACK_CLOSE_MS)
          : null;

    const [auctionLot] = await db
      .insert(auctionLots)
      .values({
        auctionId,
        lotId: parsed.data.lotId,
        lotNumber: parsed.data.lotNumber,
        closingAt,
      })
      .returning();

    // Only flip the lot into the biddable state when the auction is actually
    // running; otherwise leave it in its current (pre-auction) status.
    const [lotRow] = await db.select().from(lots).where(eq(lots.id, parsed.data.lotId)).limit(1);
    await Promise.all([
      isAuctionLive
        ? db.update(lots).set({ status: 'in_auction', updatedAt: sql`now()` }).where(eq(lots.id, parsed.data.lotId))
        : Promise.resolve(),
      db.update(auctions).set({ lotCount: sql`${auctions.lotCount} + 1`, updatedAt: sql`now()` }).where(eq(auctions.id, auctionId)),
    ]);

    if (isAuctionLive && closingAt) {
      await initializeLotBidState(parsed.data.lotId, closingAt, lotRow?.startingBid ?? 0);
    }

    revalidatePublicCatalog(auction.slug);
    return NextResponse.json({ data: auctionLot }, { status: 201 });
  } catch (error) {
    logger.error('Assign lot error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ auctionId: string }> },
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

    const { auctionId } = await params;
    const body = await req.json();
    if (!body?.lotId || typeof body.lotId !== 'string' || !UUID_RE.test(body.lotId)) {
      return NextResponse.json({ error: 'lotId is required' }, { status: 400 });
    }
    if (!UUID_RE.test(auctionId)) {
      return NextResponse.json({ error: 'Auction not found' }, { status: 404 });
    }
    const { lotId } = body as { lotId: string };

    // A relisted lot can have auction_lots rows in several auctions; match on
    // BOTH keys so we remove the right one instead of 404ing on whichever row
    // happened to come back first.
    const [existing] = await db
      .select()
      .from(auctionLots)
      .where(and(eq(auctionLots.lotId, lotId), eq(auctionLots.auctionId, auctionId)))
      .limit(1);

    if (!existing) {
      return NextResponse.json({ error: 'Lot not found in auction' }, { status: 404 });
    }

    await db.delete(auctionLots).where(eq(auctionLots.id, existing.id));

    // Revert lot status and update auction lot count
    await Promise.all([
      db.update(lots).set({ status: 'approved', updatedAt: sql`now()` }).where(eq(lots.id, lotId)),
      db.update(auctions).set({ lotCount: sql`${auctions.lotCount} - 1`, updatedAt: sql`now()` }).where(eq(auctions.id, auctionId)),
    ]);

    revalidatePublicCatalog();
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Remove lot error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
