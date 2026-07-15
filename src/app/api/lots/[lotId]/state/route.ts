import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { lots, auctions, auctionLots } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';
import { createClient } from '@/lib/supabase/server';
import { getMinNextBid } from '@/lib/bidding/bid-increments';
import { UUID_RE, biddableAuctionOrder } from '@/lib/bidding/lot-resolution';
import { logger } from '@/lib/logger';

/**
 * Lightweight public lot-state endpoint for live price/countdown polling. Returns
 * only what the lot page already shows (current bid, bid count, closing time,
 * auction status) plus the server clock so the client countdown can correct for
 * device clock skew. No bidder identities are exposed.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ lotId: string }> },
) {
  try {
    const { lotId } = await params;
    const byId = UUID_RE.test(lotId);

    const [row] = await db
      .select({
        lotId: lots.id,
        currentBidAmount: lots.currentBidAmount,
        currentBidderId: lots.currentBidderId,
        bidCount: lots.bidCount,
        startingBid: lots.startingBid,
        lotStatus: lots.status,
        closingAt: auctionLots.closingAt,
        auctionStatus: auctions.status,
        biddingEndsAt: auctions.biddingEndsAt,
      })
      .from(lots)
      .innerJoin(auctionLots, eq(auctionLots.lotId, lots.id))
      .innerJoin(auctions, eq(auctions.id, auctionLots.auctionId))
      .where(byId ? eq(lots.id, lotId) : eq(lots.slug, lotId))
      // Prefer the currently-biddable auction — shared with the bids route so
      // both resolve a relisted lot to the same auction row.
      .orderBy(...biddableAuctionOrder, desc(auctions.biddingEndsAt))
      .limit(1);

    if (!row) {
      return NextResponse.json({ error: 'Lot not found' }, { status: 404 });
    }

    const closingAt = row.closingAt ?? row.biddingEndsAt;
    const isBiddable =
      row.lotStatus === 'in_auction' &&
      ['open', 'live', 'closed'].includes(row.auctionStatus) &&
      !!closingAt &&
      closingAt.getTime() > Date.now();

    // Auth-aware: derive whether the caller is the current high bidder WITHOUT
    // ever exposing bidder ids publicly (bidder identities stay anonymized).
    // Only pay the auth lookup when a session cookie is actually present.
    let isHighBidder: boolean | undefined;
    try {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) isHighBidder = row.currentBidderId === user.id;
    } catch {
      isHighBidder = undefined;
    }

    const startingBid = row.startingBid ?? 0;

    return NextResponse.json(
      {
        data: {
          currentBidAmount: row.currentBidAmount,
          bidCount: row.bidCount,
          startingBid,
          minNextBid: getMinNextBid(row.currentBidAmount, startingBid),
          closingAt: closingAt ? closingAt.toISOString() : null,
          auctionStatus: row.auctionStatus,
          lotStatus: row.lotStatus,
          isBiddable,
          ...(isHighBidder !== undefined ? { isHighBidder } : {}),
          serverNow: Date.now(),
        },
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    logger.error('Lot state error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
