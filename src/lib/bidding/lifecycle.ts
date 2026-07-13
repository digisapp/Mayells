import { db } from '@/db';
import { auctions, auctionLots, lots } from '@/db/schema';
import { eq, asc, gt, and } from 'drizzle-orm';
import { initializeLotBidState } from './bid-engine';
import { redis } from '@/lib/redis';
import { logger } from '@/lib/logger';

type Auction = typeof auctions.$inferSelect;

// For a live auction with no scheduled biddingEndsAt, bidding stays open until
// the auctioneer ends the session. We still need a close-time so the atomic bid
// gate has an upper bound and forceCloseAuctionLots (which filters on a
// non-null closingAt) can find the lot; use a far-future placeholder that the
// end route collapses to "now" when the auctioneer stops the auction.
export const LIVE_FALLBACK_CLOSE_MS = 12 * 60 * 60 * 1000;

/**
 * Move an auction's lots into the biddable state exactly once:
 *  - flip each lot to `in_auction`
 *  - assign a staggered per-lot `closingAt`
 *  - initialize the authoritative Redis bid state so the atomic bid gate works
 *
 * Idempotent: safe to re-run (re-sets the same closingAt / re-seeds Redis for a
 * lot that has no bids yet). Shared by the settlement cron's "open" step and the
 * live-start route, so a live auction started from `scheduled`/`preview` gets
 * its lots opened instead of flipping to `live` with unbiddable lots.
 *
 * Does NOT change the auction's own status — the caller sets `open` (cron) or
 * `live` (start route) after this returns.
 */
export async function openAuctionLots(auction: Auction, now: Date = new Date()): Promise<number> {
  // Determine the base close time for lot #0.
  let baseCloseMs: number | null = auction.biddingEndsAt?.getTime() ?? null;
  if (baseCloseMs === null) {
    if (auction.type === 'live') {
      baseCloseMs = now.getTime() + LIVE_FALLBACK_CLOSE_MS;
    } else {
      // A timed auction with no end time is a misconfiguration — do not open
      // lots we can never correctly settle.
      logger.error('Cannot open timed auction with no biddingEndsAt', undefined, {
        auctionId: auction.id,
      });
      return 0;
    }
  }

  const aLots = await db
    .select({ auctionLot: auctionLots, lot: lots })
    .from(auctionLots)
    .innerJoin(lots, eq(lots.id, auctionLots.lotId))
    .where(eq(auctionLots.auctionId, auction.id))
    .orderBy(asc(auctionLots.lotNumber));

  const intervalSeconds = auction.lotClosingIntervalSeconds ?? 0;
  let opened = 0;

  for (const [index, { auctionLot: al, lot }] of aLots.entries()) {
    await db
      .update(lots)
      .set({ status: 'in_auction', updatedAt: now })
      .where(eq(lots.id, al.lotId));

    const closingAt = new Date(baseCloseMs + index * intervalSeconds * 1000);
    await db
      .update(auctionLots)
      .set({ closingAt })
      .where(eq(auctionLots.id, al.id));

    await initializeLotBidState(al.lotId, closingAt, lot.startingBid ?? 0);
    opened++;
  }

  return opened;
}

/**
 * Force-close every still-open lot in an auction *right now*. Called when an
 * auctioneer ends a live auction early: collapses each lot's `closingAt` to
 * `now` and pushes the same close time into Redis so the atomic bid gate and
 * the API's per-lot close check both reject further bids immediately. Without
 * this, the settlement cron flips the auction to `closed` (a biddable status
 * for staggered timed auctions) while per-lot `closingAt` values are still in
 * the future, silently reopening bidding after an early end.
 */
export async function forceCloseAuctionLots(auctionId: string, now: Date = new Date()): Promise<void> {
  const openLots = await db
    .select({ id: auctionLots.id, lotId: auctionLots.lotId })
    .from(auctionLots)
    .where(and(eq(auctionLots.auctionId, auctionId), gt(auctionLots.closingAt, now)));

  const nowSeconds = Math.floor(now.getTime() / 1000);

  for (const al of openLots) {
    await db
      .update(auctionLots)
      .set({ closingAt: now })
      .where(eq(auctionLots.id, al.id));

    try {
      await redis.set(`bid:lot:${al.lotId}:close_time`, nowSeconds);
    } catch (err) {
      logger.error('Failed to collapse Redis close time on early end', err, {
        lotId: al.lotId,
      });
    }
  }
}
