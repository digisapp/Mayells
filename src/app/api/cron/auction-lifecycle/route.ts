import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { db } from '@/db';
import { auctions, auctionLots, lots, bids, consignments } from '@/db/schema';
import { eq, lte, and, or, inArray, desc, asc } from 'drizzle-orm';
import { generateInvoiceForWonLot } from '@/lib/invoicing/generate-invoice';
import { initializeLotBidState } from '@/lib/bidding/bid-engine';
import { redis } from '@/lib/redis';
import { logger } from '@/lib/logger';

const CRON_SECRET = process.env.CRON_SECRET;

function isAuthorized(request: NextRequest): boolean {
  // Verify cron secret — always required
  if (!CRON_SECRET) return false;
  const authHeader = request.headers.get('authorization') ?? '';
  const expected = Buffer.from(`Bearer ${CRON_SECRET}`);
  const provided = Buffer.from(authHeader);
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

async function handler(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  const results = {
    opened: 0,
    closed: 0,
    lotsSettled: 0,
    invoicesGenerated: 0,
    relistedToGallery: 0,
    returnedToSeller: 0,
    errors: [] as string[],
  };

  try {
    // 1. Open scheduled auctions whose bidding start time has passed
    const toOpen = await db
      .select()
      .from(auctions)
      .where(
        and(
          inArray(auctions.status, ['scheduled', 'preview']),
          lte(auctions.biddingStartsAt, now),
        ),
      );

    for (const auction of toOpen) {
      try {
        const aLots = await db
          .select({ auctionLot: auctionLots, lot: lots })
          .from(auctionLots)
          .innerJoin(lots, eq(lots.id, auctionLots.lotId))
          .where(eq(auctionLots.auctionId, auction.id))
          .orderBy(asc(auctionLots.lotNumber));

        const intervalSeconds = auction.lotClosingIntervalSeconds ?? 0;

        for (const [index, { auctionLot: al, lot }] of aLots.entries()) {
          await db
            .update(lots)
            .set({ status: 'in_auction', updatedAt: now })
            .where(eq(lots.id, al.lotId));

          // Staggered closing: each lot closes intervalSeconds after the previous one.
          // The bid engine's anti-snipe may push closingAt later as bids come in.
          if (auction.biddingEndsAt) {
            const closingAt = new Date(
              auction.biddingEndsAt.getTime() + index * intervalSeconds * 1000,
            );
            await db
              .update(auctionLots)
              .set({ closingAt })
              .where(eq(auctionLots.id, al.id));

            await initializeLotBidState(al.lotId, closingAt, lot.startingBid ?? 0);
          }
        }

        // Flip status last so a crash mid-initialization re-runs the (idempotent) loop
        await db
          .update(auctions)
          .set({ status: 'open', updatedAt: now })
          .where(eq(auctions.id, auction.id));

        results.opened++;
      } catch (err) {
        results.errors.push(`Failed to open auction ${auction.id}: ${err}`);
      }
    }

    // 2. Settle auctions past their end time, plus any auction stuck mid-settlement:
    //    - 'closing' is set by the live auction end route (auctioneer ended early)
    //    - 'closed' means a previous run started settling but didn't finish
    const toSettle = await db
      .select()
      .from(auctions)
      .where(
        or(
          and(
            inArray(auctions.status, ['open', 'live']),
            lte(auctions.biddingEndsAt, now),
          ),
          inArray(auctions.status, ['closing', 'closed']),
        ),
      );

    for (const auction of toSettle) {
      try {
        if (auction.status !== 'closed') {
          await db
            .update(auctions)
            .set({
              status: 'closed',
              actualEndedAt: auction.actualEndedAt ?? now,
              updatedAt: now,
            })
            .where(eq(auctions.id, auction.id));
        }

        const aLots = await db
          .select({ auctionLot: auctionLots, lot: lots })
          .from(auctionLots)
          .innerJoin(lots, eq(lots.id, auctionLots.lotId))
          .where(eq(auctionLots.auctionId, auction.id))
          .orderBy(asc(auctionLots.lotNumber));

        let unsettledRemaining = 0;

        for (const { auctionLot: al, lot } of aLots) {
          // Already settled (sold / relisted / returned) — idempotent skip
          if (lot.status !== 'in_auction') continue;

          // Respect per-lot close times (staggered closing + anti-snipe extensions)
          const effectiveCloseAt =
            al.closingAt ?? auction.biddingEndsAt ?? auction.actualEndedAt;
          if (effectiveCloseAt && effectiveCloseAt > now) {
            unsettledRemaining++;
            continue;
          }

          try {
            // Highest active bid wins; earliest bid wins amount ties
            const [winningBid] = await db
              .select()
              .from(bids)
              .where(and(eq(bids.lotId, al.lotId), eq(bids.status, 'active')))
              .orderBy(desc(bids.amount), asc(bids.createdAt))
              .limit(1);

            const reserveMet =
              !lot.reservePrice || (winningBid && winningBid.amount >= lot.reservePrice);

            if (winningBid && reserveMet) {
              // Lot is sold — mark winning bid
              await db
                .update(bids)
                .set({ status: 'winning' })
                .where(eq(bids.id, winningBid.id));

              // Update lot with winner
              await db
                .update(lots)
                .set({
                  winnerId: winningBid.bidderId,
                  hammerPrice: winningBid.amount,
                  status: 'sold',
                  updatedAt: now,
                })
                .where(eq(lots.id, al.lotId));

              // Generate invoice
              try {
                await generateInvoiceForWonLot({
                  auctionId: auction.id,
                  lotId: al.lotId,
                  buyerId: winningBid.bidderId,
                  hammerPrice: winningBid.amount,
                });
                results.invoicesGenerated++;
              } catch (err) {
                results.errors.push(`Failed to generate invoice for lot ${al.lotId}: ${err}`);
              }
            } else {
              // Unsold (no bids or reserve not met) — relist in gallery or return to seller
              const relistResult = await relistUnsoldLot(lot, now);
              if (relistResult === 'relisted') results.relistedToGallery++;
              if (relistResult === 'returned') results.returnedToSeller++;
            }

            // Demote remaining active bids to outbid (the winner is already 'winning')
            await db
              .update(bids)
              .set({ status: 'outbid' })
              .where(and(eq(bids.lotId, al.lotId), eq(bids.status, 'active')));

            // Clean up Redis bid state so a relist starts fresh
            try {
              await redis.del(
                `bid:lot:${al.lotId}:current`,
                `bid:lot:${al.lotId}:current:bid_count`,
                `bid:lot:${al.lotId}:close_time`,
              );
            } catch (err) {
              results.errors.push(`Failed to clear Redis bid state for lot ${al.lotId}: ${err}`);
            }

            results.lotsSettled++;
          } catch (err) {
            unsettledRemaining++;
            results.errors.push(`Failed to settle lot ${al.lotId}: ${err}`);
          }
        }

        // Mark auction completed only once every lot has been settled
        if (unsettledRemaining === 0) {
          await db
            .update(auctions)
            .set({ status: 'completed', updatedAt: now })
            .where(eq(auctions.id, auction.id));

          results.closed++;
        }
      } catch (err) {
        results.errors.push(`Failed to close auction ${auction.id}: ${err}`);
      }
    }

    return NextResponse.json({
      success: true,
      timestamp: now.toISOString(),
      ...results,
    });
  } catch (error) {
    logger.error('Cron lifecycle error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Vercel cron invokes with GET; keep POST for manual/legacy triggers
export { handler as GET, handler as POST };

/**
 * Handle unsold lots after auction closes:
 * - Relist in gallery/shop at low estimate or reserve price (buy-now)
 * - Or return to seller if no estimate available
 * - Update consignment status accordingly
 */
async function relistUnsoldLot(
  lot: { id: string; estimateLow?: number | null; reservePrice?: number | null; consignmentId?: string | null },
  now: Date
): Promise<'relisted' | 'returned'> {
  const buyNowPrice = lot.reservePrice || lot.estimateLow;

  if (buyNowPrice && buyNowPrice > 0) {
    // Relist as gallery item (buy-now) at reserve or low estimate
    await db.update(lots).set({
      status: 'for_sale',
      saleType: 'gallery',
      buyNowPrice: buyNowPrice,
      currentBidAmount: 0,
      currentBidderId: null,
      bidCount: 0,
      winnerId: null,
      hammerPrice: null,
      updatedAt: now,
    }).where(eq(lots.id, lot.id));

    logger.info('Unsold lot relisted in gallery', {
      lotId: lot.id,
      buyNowPrice,
    });

    // Update consignment if linked
    if (lot.consignmentId) {
      await db.update(consignments).set({
        status: 'listed',
        reviewNotes: `Unsold at auction — relisted in gallery at $${(buyNowPrice / 100).toLocaleString()}`,
        updatedAt: now,
      }).where(eq(consignments.id, lot.consignmentId));
    }

    return 'relisted';
  } else {
    // No price to relist at — mark as unsold, return to seller
    await db.update(lots).set({
      status: 'unsold',
      updatedAt: now,
    }).where(eq(lots.id, lot.id));

    if (lot.consignmentId) {
      await db.update(consignments).set({
        status: 'returned',
        reviewNotes: 'Unsold at auction — returned to seller',
        updatedAt: now,
      }).where(eq(consignments.id, lot.consignmentId));
    }

    return 'returned';
  }
}
