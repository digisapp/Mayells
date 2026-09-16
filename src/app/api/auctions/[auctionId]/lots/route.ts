import { NextRequest, NextResponse } from 'next/server';
import { isAdminProfile } from '@/lib/auth/admin';
import { requireAdminApi } from '@/lib/auth/require-admin';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/db';
import { auctionLots, lots, auctions, users, bids } from '@/db/schema';
import { eq, asc, sql, and, inArray, or, max } from 'drizzle-orm';
import { z } from 'zod';
import { assignLotSchema } from '@/lib/validation/schemas';
import { initializeLotBidState } from '@/lib/bidding/bid-engine';
import { LIVE_FALLBACK_CLOSE_MS, clearLotBidState } from '@/lib/bidding/lifecycle';
import { UUID_RE } from '@/lib/bidding/lot-resolution';
import { isPubliclyVisibleAuction } from '@/lib/auctions/visibility';
import { PUBLIC_CATALOGUE_LOT_STATUSES, toPublicLot } from '@/lib/lots/visibility';
import { revalidatePublicCatalog } from '@/lib/revalidate';
import { logger } from '@/lib/logger';

/**
 * Name of the unique index/constraint behind a Postgres 23505 error, or null.
 * Drizzle wraps driver errors (the pg DatabaseError lives on `cause`), so
 * look at both layers.
 */
function uniqueViolationConstraint(err: unknown): string | null {
  const candidates = [err, (err as { cause?: unknown })?.cause];
  for (const c of candidates) {
    const e = c as { code?: string; constraint?: string } | undefined;
    if (e?.code === '23505') return e.constraint ?? '';
  }
  return null;
}

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

    // The auction's visibility was checked above, so `approved` lots in a
    // scheduled/preview catalogue are listable (PUBLIC_CATALOGUE_LOT_STATUSES);
    // draft / pending / withdrawn / unsold placements still stay hidden.
    // The high bidder's paddle number is joined for the auctioneer console
    // and only ever emitted on the admin branch.
    const result = await db
      .select({
        auctionLot: auctionLots,
        lot: lots,
        currentBidderPaddle: users.paddleNumber,
      })
      .from(auctionLots)
      .innerJoin(lots, eq(auctionLots.lotId, lots.id))
      .leftJoin(users, eq(users.id, lots.currentBidderId))
      .where(
        isAdmin
          ? eq(auctionLots.auctionId, auction.id)
          : and(
              eq(auctionLots.auctionId, auction.id),
              inArray(lots.status, [...PUBLIC_CATALOGUE_LOT_STATUSES]),
            ),
      )
      .orderBy(asc(auctionLots.lotNumber));

    const lotsWithNumbers = result.map(({ auctionLot, lot, currentBidderPaddle }) => ({
      ...(isAdmin ? { ...lot, currentBidderPaddle } : toPublicLot(lot)),
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
    const { response } = await requireAdminApi();
    if (response) return response;

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

    // A sale that has stopped taking bids is a settlement record; its lot
    // list must not grow after the fact.
    if (['closing', 'closed', 'completed', 'cancelled'].includes(auction.status)) {
      return NextResponse.json(
        { error: `This sale is ${auction.status} and can no longer take lots.` },
        { status: 409 },
      );
    }

    // Only an approved auction-type lot can be catalogued. Everything else
    // gets a message that names the fix instead of a bare constraint error.
    const [lotRow] = await db.select().from(lots).where(eq(lots.id, parsed.data.lotId)).limit(1);
    if (!lotRow) {
      return NextResponse.json({ error: 'Lot not found' }, { status: 404 });
    }
    if (lotRow.saleType !== 'auction') {
      return NextResponse.json(
        { error: 'Gallery lots are sold directly and cannot be catalogued in a sale. Change the lot\'s sale type to Auction first.' },
        { status: 400 },
      );
    }
    if (lotRow.status !== 'approved') {
      const why: Record<string, string> = {
        draft: 'Approve the lot first — it is still a draft.',
        pending_review: 'Approve the lot first — it is awaiting review.',
        for_sale: 'This lot is listed for direct sale; take it off the gallery before cataloguing it.',
        in_auction: 'This lot is already in an open sale.',
        sold: 'This lot has been sold.',
        unsold: 'This lot went unsold; relist it (approve it again) before adding it to another sale.',
        withdrawn: 'This lot was withdrawn; approve it again before adding it to a sale.',
      };
      return NextResponse.json(
        { error: why[lotRow.status] ?? `Only approved lots can be added (this one is ${lotRow.status}).` },
        { status: 400 },
      );
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
    //
    // The new lot goes to the END of the staggered close order: one interval
    // after the latest existing close time, and never before the sale's base
    // close, so it cannot close ahead of lots catalogued before it.
    const isAuctionLive = auction.status === 'open' || auction.status === 'live';
    const baseClose = !isAuctionLive
      ? null
      : auction.biddingEndsAt
        ? auction.biddingEndsAt
        : auction.type === 'live'
          ? new Date(Date.now() + LIVE_FALLBACK_CLOSE_MS)
          : null;
    let closingAt: Date | null = baseClose;
    if (baseClose) {
      const [{ latest }] = await db
        .select({ latest: max(auctionLots.closingAt) })
        .from(auctionLots)
        .where(eq(auctionLots.auctionId, auctionId));
      if (latest) {
        const intervalMs = (auction.lotClosingIntervalSeconds ?? 0) * 1000;
        closingAt = new Date(Math.max(new Date(latest).getTime() + intervalMs, baseClose.getTime()));
      }
    }

    // The unique index on (auction_id, lot_number) is the arbiter of lot
    // numbers: when the client omits one, the next free number is computed in
    // the same statement; when it supplies a stale one (two admins assigning
    // at once), the conflict surfaces as a clear 409 instead of a 500.
    let auctionLot: typeof auctionLots.$inferSelect;
    try {
      [auctionLot] = await db
        .insert(auctionLots)
        .values({
          auctionId,
          lotId: parsed.data.lotId,
          lotNumber:
            parsed.data.lotNumber ??
            sql`(select coalesce(max(${auctionLots.lotNumber}), 0) + 1 from ${auctionLots} where ${auctionLots.auctionId} = ${auctionId})`,
          closingAt,
        })
        .returning();
    } catch (err) {
      const constraint = uniqueViolationConstraint(err);
      if (constraint === 'auction_lots_auction_lot_number_unique_idx') {
        return NextResponse.json(
          { error: `Lot number ${parsed.data.lotNumber} is already used in this auction. Refresh the list and try again.` },
          { status: 409 },
        );
      }
      if (constraint === 'auction_lots_auction_lot_unique_idx') {
        return NextResponse.json({ error: 'This lot is already assigned to this auction' }, { status: 409 });
      }
      throw err;
    }

    // Only flip the lot into the biddable state when the auction is actually
    // running; otherwise leave it approved until the sale opens.
    await Promise.all([
      isAuctionLive
        ? db.update(lots).set({ status: 'in_auction', updatedAt: sql`now()` }).where(eq(lots.id, parsed.data.lotId))
        : Promise.resolve(),
      db.update(auctions).set({ lotCount: sql`${auctions.lotCount} + 1`, updatedAt: sql`now()` }).where(eq(auctions.id, auctionId)),
    ]);

    if (isAuctionLive && closingAt) {
      await initializeLotBidState(parsed.data.lotId, closingAt, lotRow.startingBid ?? 0);
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

    const [auction] = await db.select().from(auctions).where(eq(auctions.id, auctionId)).limit(1);
    if (auction && ['closing', 'closed', 'completed'].includes(auction.status)) {
      return NextResponse.json(
        { error: 'This sale has ended; its lot list is a settlement record and cannot be changed.' },
        { status: 409 },
      );
    }

    // Once bidding is open a lot with bids is a live contract with its bidders.
    // Pulling it out silently would strand those bids; the lot editor's
    // Withdraw action retracts them properly.
    if (auction && (auction.status === 'open' || auction.status === 'live')) {
      const [{ count }] = await db
        .select({ count: sql<number>`count(*)` })
        .from(bids)
        .where(and(eq(bids.lotId, lotId), eq(bids.auctionId, auctionId), inArray(bids.status, ['active', 'winning'])));
      if (Number(count) > 0) {
        return NextResponse.json(
          { error: 'This lot has bids. Withdraw it from the lot editor instead of removing it from the sale.' },
          { status: 409 },
        );
      }
    }

    await db.delete(auctionLots).where(eq(auctionLots.id, existing.id));

    // Revert lot status and update auction lot count
    await Promise.all([
      db.update(lots).set({ status: 'approved', currentBidAmount: 0, currentBidderId: null, bidCount: 0, updatedAt: sql`now()` }).where(eq(lots.id, lotId)),
      db.update(auctions).set({ lotCount: sql`greatest(${auctions.lotCount} - 1, 0)`, updatedAt: sql`now()` }).where(eq(auctions.id, auctionId)),
    ]);

    // A lot pulled from an open sale still has a Redis close gate; drop it so
    // a later placement seeds fresh state.
    if (auction && (auction.status === 'open' || auction.status === 'live')) {
      await clearLotBidState([lotId]);
    }

    revalidatePublicCatalog(auction?.slug);
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Remove lot error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

const renumberSchema = z.object({
  lotId: z.string().uuid(),
  lotNumber: z.number().int().positive(),
});

/** PATCH — renumber a lot within the sale (lot order drives the staggered close). */
export async function PATCH(
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
    const parsed = renumberSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const [auction] = await db.select().from(auctions).where(eq(auctions.id, auctionId)).limit(1);
    if (!auction) {
      return NextResponse.json({ error: 'Auction not found' }, { status: 404 });
    }
    if (!['draft', 'scheduled', 'preview'].includes(auction.status)) {
      return NextResponse.json(
        { error: 'Lot numbers are fixed once bidding opens — they set the closing order.' },
        { status: 409 },
      );
    }

    try {
      const [row] = await db
        .update(auctionLots)
        .set({ lotNumber: parsed.data.lotNumber })
        .where(and(eq(auctionLots.auctionId, auctionId), eq(auctionLots.lotId, parsed.data.lotId)))
        .returning();
      if (!row) {
        return NextResponse.json({ error: 'Lot not found in auction' }, { status: 404 });
      }
      revalidatePublicCatalog(auction.slug);
      return NextResponse.json({ data: row });
    } catch (err) {
      if (uniqueViolationConstraint(err) === 'auction_lots_auction_lot_number_unique_idx') {
        return NextResponse.json(
          { error: `Lot number ${parsed.data.lotNumber} is already used in this sale.` },
          { status: 409 },
        );
      }
      throw err;
    }
  } catch (error) {
    logger.error('Renumber lot error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
