import { NextRequest, NextResponse, after } from 'next/server';
import { createHash } from 'crypto';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/db';
import { lots, auctions, auctionLots, bids, maxBids } from '@/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { bidSchema } from '@/lib/validation/schemas';
import { placeBid } from '@/lib/bidding/bid-engine';
import { notifyOutbid, computeOutbidRecipients } from '@/lib/bidding/notify-outbid';
import { getBidderVerification, checkBidAllowed } from '@/lib/bidding/verification';
import { UUID_RE, biddableAuctionOrder } from '@/lib/bidding/lot-resolution';
import { rateLimit } from '@/lib/rate-limit';
import { getClientIp } from '@/lib/request-ip';
import { logger } from '@/lib/logger';

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
    // A relisted lot can belong to more than one auction row. Prefer the
    // currently-biddable auction (shared ordering with the lot-state route) so
    // a bid is never rejected or stamped with the wrong auctionId because an
    // old completed auction happened to sort first.
    .orderBy(...biddableAuctionOrder, desc(auctions.biddingEndsAt))
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
    // Bidding is governed per-lot by the lot's own closingAt (staggered
    // closing + anti-snipe) and the atomic Redis close-time check — NOT by
    // the auction row flipping to 'closed' at biddingEndsAt. The settlement
    // cron marks an auction 'closed' while its later lots are still inside
    // their staggered close windows, so we must keep accepting bids on those
    // lots. Reject only auctions that are genuinely not biddable (upcoming,
    // completed, cancelled) or being ended early ('closing').
    const biddableAuctionStatuses = ['open', 'live', 'closed'];
    if (!biddableAuctionStatuses.includes(auction.status)) {
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

    // Bidder-verification gate. The commitment being made is the greater of the
    // live bid and any proxy max — a $30k max requires the same clearance as a
    // $30k bid — so gate on that. Returns the tier the bidder must reach so the
    // UI can launch the right verification flow.
    const commitment = Math.max(amount, maxBidAmount ?? 0);
    const verification = await getBidderVerification(user.id);

    // A suspended or banned bidder cannot place bids — enforced here so the
    // admin "suspend" action actually has teeth in the bid flow.
    if (!verification.canBid) {
      return NextResponse.json(
        { error: 'Your account is not permitted to place bids. Please contact us.', code: 'ACCOUNT_RESTRICTED' },
        { status: 403 },
      );
    }

    const gate = checkBidAllowed(verification, commitment);
    if (!gate.allowed) {
      return NextResponse.json(
        { error: gate.reason, code: 'VERIFICATION_REQUIRED', requiredTier: gate.requiredTier },
        { status: 403 },
      );
    }

    // Record/refresh the user's max bid before placing, so proxy bidding
    // can resolve competing max bids in this same call. No unique
    // constraint exists on (lotId, bidderId) yet, so select-then-write.
    //
    // Capture the prior state so we can ROLL BACK if the manual bid ends up
    // rejected — otherwise a bid that returns BID_TOO_LOW / AUCTION_CLOSED
    // would still leave the user's proxy armed, and it could later win the lot
    // on their behalf without a single confirmed bid.
    let priorMax: { id: string; maxAmount: number; isActive: boolean } | null = null;
    let insertedMaxId: string | null = null;
    if (maxBidAmount !== undefined) {
      const [existing] = await db
        .select()
        .from(maxBids)
        .where(and(eq(maxBids.lotId, lot.id), eq(maxBids.bidderId, user.id)))
        .limit(1);

      if (existing) {
        priorMax = { id: existing.id, maxAmount: existing.maxAmount, isActive: existing.isActive };
        await db
          .update(maxBids)
          .set({ maxAmount: maxBidAmount, isActive: true, updatedAt: new Date() })
          .where(eq(maxBids.id, existing.id));
      } else {
        const [inserted] = await db
          .insert(maxBids)
          .values({ lotId: lot.id, bidderId: user.id, maxAmount: maxBidAmount })
          .returning({ id: maxBids.id });
        insertedMaxId = inserted.id;
      }
    }

    const rollbackMaxBid = async () => {
      try {
        if (priorMax) {
          await db
            .update(maxBids)
            .set({ maxAmount: priorMax.maxAmount, isActive: priorMax.isActive, updatedAt: new Date() })
            .where(eq(maxBids.id, priorMax.id));
        } else if (insertedMaxId) {
          await db.delete(maxBids).where(eq(maxBids.id, insertedMaxId));
        }
      } catch (err) {
        logger.error('Failed to roll back max bid after rejected bid', err, { lotId: lot.id });
      }
    };

    const result = await placeBid({
      lotId: lot.id,
      auctionId: auction.id,
      bidderId: user.id,
      amount,
      maxBidAmount,
      bidType: 'manual',
      idempotencyKey,
      ipAddress: getClientIp(request),
      userAgent: request.headers.get('user-agent') || undefined,
      startingBid: lot.startingBid ?? 0,
      antiSnipeSettings: {
        antiSnipeEnabled: auction.antiSnipeEnabled,
        antiSnipeMinutes: auction.antiSnipeMinutes,
        antiSnipeWindowMinutes: auction.antiSnipeWindowMinutes,
      },
    });

    if (!result.success) {
      // Raising your own max bid while already the high bidder is a valid
      // action, not an error — the max was already persisted above. Report
      // success so the client doesn't think the update failed.
      if (result.error === 'ALREADY_HIGH_BIDDER' && maxBidAmount !== undefined) {
        const [current] = await db
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
              maxBidUpdated: true,
              currentBidAmount: current?.currentBidAmount ?? amount,
              bidCount: current?.bidCount ?? lot.bidCount,
              isHighBidder: current?.currentBidderId === user.id,
            },
          },
          { status: 200 },
        );
      }
      // The bid was rejected (too low / closed / etc.) — undo the proxy we
      // armed above so it can't win the lot for a bid that never landed.
      await rollbackMaxBid();
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

    // Outbid notifications — sent AFTER the response so they never slow a bid.
    // Comparing the high bidder before this request against the final high
    // bidder (after any proxy war resolved) notifies exactly the people who
    // lost the top spot, each once:
    //   • the person who was leading before this bid, if now displaced; and
    //   • this bidder, if a rival's proxy instantly bid over them.
    const finalHighBidderId = updatedLot?.currentBidderId ?? null;
    const finalAmount = updatedLot?.currentBidAmount ?? amount;
    const lotRef = lot.slug || lot.id;
    const recipients = computeOutbidRecipients({
      priorHighBidderId: lot.currentBidderId,
      priorAmount: lot.currentBidAmount,
      requesterId: user.id,
      requesterAmount: amount,
      finalHighBidderId,
    });

    if (recipients.length > 0) {
      after(async () => {
        for (const { bidderId, yourBid } of recipients) {
          await notifyOutbid({
            bidderId,
            yourBid,
            currentBid: finalAmount,
            lotTitle: lot.title,
            lotRef,
          });
        }
      });
    }

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
