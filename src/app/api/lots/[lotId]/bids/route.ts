import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/db';
import { lots, auctions, auctionLots, bids, maxBids } from '@/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { bidSchema } from '@/lib/validation/schemas';
import { placeBid } from '@/lib/bidding/bid-engine';
import { rateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Map bid-engine error codes to HTTP responses
const ENGINE_ERRORS: Record<string, { status: number; message: string }> = {
  BID_TOO_LOW: { status: 409, message: 'Bid is below the minimum required amount' },
  AUCTION_CLOSED: { status: 409, message: 'Bidding has closed for this lot' },
  ALREADY_HIGH_BIDDER: { status: 409, message: 'You are already the high bidder' },
  STATE_MISSING: { status: 409, message: 'Bidding is not open for this lot' },
};

async function loadLotWithAuction(lotId: string) {
  const byId = UUID_RE.test(lotId);
  const [row] = await db
    .select({
      lot: lots,
      auction: auctions,
      auctionLot: auctionLots,
    })
    .from(lots)
    .innerJoin(auctionLots, eq(auctionLots.lotId, lots.id))
    .innerJoin(auctions, eq(auctions.id, auctionLots.auctionId))
    .where(byId ? eq(lots.id, lotId) : eq(lots.slug, lotId))
    .limit(1);

  return row;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ lotId: string }> },
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { success } = await rateLimit(`bids:${user.id}`, { maxRequests: 30, windowSeconds: 60 });
    if (!success) {
      return NextResponse.json({ error: 'Too many bids. Please slow down.' }, { status: 429 });
    }

    const body = await request.json();
    const parsed = bidSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid data', details: parsed.error.flatten() }, { status: 400 });
    }
    const { amount, maxBidAmount, idempotencyKey } = parsed.data;

    const { lotId } = await params;
    const row = await loadLotWithAuction(lotId);
    if (!row) {
      return NextResponse.json({ error: 'Lot not found' }, { status: 404 });
    }
    const { lot, auction, auctionLot } = row;

    if (lot.status !== 'in_auction') {
      return NextResponse.json({ error: 'This lot is not open for bidding' }, { status: 409 });
    }
    if (auction.status !== 'open' && auction.status !== 'live') {
      return NextResponse.json({ error: 'This auction is not open for bidding' }, { status: 409 });
    }

    const now = new Date();
    if (auction.biddingStartsAt && now < auction.biddingStartsAt) {
      return NextResponse.json({ error: 'Bidding has not started yet' }, { status: 409 });
    }
    const closingAt = auctionLot.closingAt ?? auction.biddingEndsAt;
    if (closingAt && now >= closingAt) {
      return NextResponse.json({ error: 'Bidding has closed for this lot' }, { status: 409 });
    }

    if (lot.sellerId && lot.sellerId === user.id) {
      return NextResponse.json({ error: 'You cannot bid on your own lot' }, { status: 403 });
    }

    // Record/refresh the user's max bid before placing, so proxy bidding
    // can resolve competing max bids in this same call. No unique
    // constraint exists on (lotId, bidderId) yet, so select-then-write.
    if (maxBidAmount !== undefined) {
      const [existing] = await db
        .select()
        .from(maxBids)
        .where(and(eq(maxBids.lotId, lot.id), eq(maxBids.bidderId, user.id)))
        .limit(1);

      if (existing) {
        await db
          .update(maxBids)
          .set({ maxAmount: maxBidAmount, isActive: true, updatedAt: new Date() })
          .where(eq(maxBids.id, existing.id));
      } else {
        await db.insert(maxBids).values({
          lotId: lot.id,
          bidderId: user.id,
          maxAmount: maxBidAmount,
        });
      }
    }

    const result = await placeBid({
      lotId: lot.id,
      auctionId: auction.id,
      bidderId: user.id,
      amount,
      maxBidAmount,
      bidType: 'manual',
      idempotencyKey,
      ipAddress: request.headers.get('x-forwarded-for') || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
      startingBid: lot.startingBid ?? 0,
      antiSnipeSettings: {
        antiSnipeEnabled: auction.antiSnipeEnabled,
        antiSnipeMinutes: auction.antiSnipeMinutes,
        antiSnipeWindowMinutes: auction.antiSnipeWindowMinutes,
      },
    });

    if (!result.success) {
      const mapped = result.error ? ENGINE_ERRORS[result.error] : undefined;
      if (mapped) {
        return NextResponse.json(
          {
            error: mapped.message,
            code: result.error,
            ...(result.minRequired !== undefined ? { minRequired: result.minRequired } : {}),
          },
          { status: mapped.status },
        );
      }
      logger.error('Unexpected bid engine error', { lotId: lot.id, code: result.error });
      return NextResponse.json({ error: 'Unable to place bid' }, { status: 400 });
    }

    // Re-read the denormalized lot state so the response reflects any proxy
    // (max bid) battles that resolved after this bid landed.
    const [updatedLot] = await db
      .select({
        currentBidAmount: lots.currentBidAmount,
        currentBidderId: lots.currentBidderId,
        bidCount: lots.bidCount,
      })
      .from(lots)
      .where(eq(lots.id, lot.id))
      .limit(1);

    return NextResponse.json(
      {
        data: {
          bid: {
            id: result.bid?.id,
            amount: result.bid?.amount,
            createdAt: result.bid?.createdAt,
          },
          currentBidAmount: updatedLot?.currentBidAmount ?? amount,
          bidCount: updatedLot?.bidCount ?? lot.bidCount + 1,
          isHighBidder: updatedLot?.currentBidderId === user.id,
          extended: result.extended ?? false,
          newCloseTime: result.newCloseTime,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    logger.error('Place bid error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ lotId: string }> },
) {
  try {
    const { lotId } = await params;
    const row = await loadLotWithAuction(lotId);
    if (!row) {
      return NextResponse.json({ error: 'Lot not found' }, { status: 404 });
    }

    const history = await db
      .select({
        amount: bids.amount,
        createdAt: bids.createdAt,
        bidType: bids.bidType,
        status: bids.status,
        bidderId: bids.bidderId,
      })
      .from(bids)
      .where(eq(bids.lotId, row.lot.id))
      .orderBy(desc(bids.createdAt))
      .limit(50);

    // Public-safe shape: anonymize bidders, never expose ids, max bids,
    // ip, or user agent.
    const data = history.map((bid) => ({
      amount: bid.amount,
      createdAt: bid.createdAt,
      bidType: bid.bidType,
      status: bid.status,
      bidder: `Bidder ${createHash('sha256')
        .update(`${row.lot.id}:${bid.bidderId}`)
        .digest('hex')
        .slice(0, 6)}`,
    }));

    return NextResponse.json({ data });
  } catch (error) {
    logger.error('Get bid history error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
