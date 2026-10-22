import { db } from '@/db';
import { auctions, auctionLots, lots, bids, maxBids } from '@/db/schema';
import { eq, asc, gt, and, inArray, isNull, ne, notInArray, sql } from 'drizzle-orm';
import { findLiveInvoiceForLot } from '@/lib/invoicing/generate-invoice';
import { initializeLotBidStates, settlingKeyFor } from './bid-engine';
import { isOnSiteBiddingSale } from './venue';
import { ACTIVE_SALE_STATUSES } from '@/lib/lots/placement';
import { redis } from '@/lib/redis';
import { logger } from '@/lib/logger';

type Auction = typeof auctions.$inferSelect;
type AuctionStatus = Auction['status'];
type Executor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Sale statuses in which a placement's lot is (or was just) taking bids. Includes
 * 'closing', unlike the public BIDDING_SALE_STATUSES in lib/auctions/bidding-window. */
const LIVE_PLACEMENT_SALE_STATUSES: readonly AuctionStatus[] = ['open', 'live', 'closing', 'closed'];

/**
 * Of `lotIds`, the ones another sale (in one of `statuses`) also holds — the
 * set-based form of findActivePlacement. A lot in two unfinished sales is a
 * data error; whichever sale is acting must not take over the other's lot.
 */
async function lotsHeldByOtherSales(
  lotIds: string[],
  exceptAuctionId: string,
  statuses: readonly AuctionStatus[] = ACTIVE_SALE_STATUSES,
  executor: Executor = db,
): Promise<Set<string>> {
  if (lotIds.length === 0) return new Set();
  const rows = await executor
    .select({ lotId: auctionLots.lotId })
    .from(auctionLots)
    .innerJoin(auctions, eq(auctions.id, auctionLots.auctionId))
    .where(and(
      inArray(auctionLots.lotId, lotIds),
      ne(auctionLots.auctionId, exceptAuctionId),
      inArray(auctions.status, [...statuses]),
    ));
  return new Set(rows.map((r) => r.lotId));
}

// For a live auction with no scheduled biddingEndsAt, bidding stays open until
// the auctioneer ends the session. We still need a close-time so the atomic bid
// gate has an upper bound and forceCloseAuctionLots (which filters on a
// non-null closingAt) can find the lot; use a far-future placeholder that the
// end route collapses to "now" when the auctioneer stops the auction.
export const LIVE_FALLBACK_CLOSE_MS = 12 * 60 * 60 * 1000;

/**
 * A LiveAuctioneers sale's lots stay `approved` while it runs (they take no
 * bids here), so the listed_at trigger — which fires on for_sale/in_auction —
 * never stamps them. Stamp them when the sale opens so saved-search alerts
 * announce them like any other lot going on sale. Idempotent.
 */
export async function markLiveAuctioneersLotsListed(auctionId: string, now: Date = new Date()): Promise<void> {
  await db
    .update(lots)
    .set({ listedAt: now })
    .where(
      and(
        isNull(lots.listedAt),
        eq(lots.status, 'approved'),
        inArray(
          lots.id,
          db.select({ id: auctionLots.lotId }).from(auctionLots).where(eq(auctionLots.auctionId, auctionId)),
        ),
      ),
    );
}

/**
 * Move an auction's lots into the biddable state exactly once:
 *  - flip each `approved` lot to `in_auction`
 *  - assign a staggered per-lot `closingAt`
 *  - initialize the authoritative Redis bid state so the atomic bid gate works
 *
 * Idempotent: safe to re-run (re-sets the same closingAt / re-seeds Redis for a
 * lot that has no bids yet). Shared by the settlement cron's "open" step and the
 * live-start route, so a live auction started from `scheduled`/`preview` gets
 * its lots opened instead of flipping to `live` with unbiddable lots.
 *
 * Lots in any other state (draft, sold, withdrawn, listed in the gallery…)
 * are skipped with a warning, as is an `in_auction` lot another bidding sale
 * holds. A LiveAuctioneers sale opens nothing: it takes no bids here.
 *
 * Does NOT change the auction's own status — the caller sets `open` (cron) or
 * `live` (start route) after this returns. Returns the number of lots made
 * biddable.
 */
export async function openAuctionLots(auction: Auction, now: Date = new Date()): Promise<number> {
  if (!isOnSiteBiddingSale(auction)) {
    logger.warn('Not opening lots of a LiveAuctioneers sale on mayells.com', { auctionId: auction.id });
    return 0;
  }

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

  if (aLots.length === 0) return 0;

  const intervalSeconds = auction.lotClosingIntervalSeconds ?? 0;
  const lotIds = aLots.map(({ auctionLot: al }) => al.lotId);

  // Flip every approved lot in one statement. RETURNING identifies the lots
  // that actually transitioned ("fresh" opens — no live bids can exist for
  // those) vs. lots already in_auction from a partially-completed earlier
  // run, which must keep their live Redis state (NX seed below).
  const flipped = await db
    .update(lots)
    .set({ status: 'in_auction', updatedAt: now })
    .where(and(inArray(lots.id, lotIds), eq(lots.status, 'approved')))
    .returning({ id: lots.id });
  const freshIds = new Set(flipped.map((row) => row.id));

  // Re-entry: in_auction before this run. Normally this sale's own lot from
  // an interrupted run — unless another bidding sale holds it.
  const reentryIds = new Set(
    aLots
      .filter(({ auctionLot: al, lot }) => !freshIds.has(al.lotId) && lot.status === 'in_auction')
      .map(({ auctionLot: al }) => al.lotId),
  );
  const heldElsewhere = await lotsHeldByOtherSales([...reentryIds], auction.id, LIVE_PLACEMENT_SALE_STATUSES);

  // Keep each lot's position in the catalogue order so a re-run computes the
  // same close times; only biddable lots get one.
  const biddable = aLots
    .map((row, index) => ({ ...row, closingAt: new Date(baseCloseMs + index * intervalSeconds * 1000) }))
    .filter(({ auctionLot: al, lot }) => {
      const ok = freshIds.has(al.lotId) || (reentryIds.has(al.lotId) && !heldElsewhere.has(al.lotId));
      if (!ok) {
        logger.warn('Lot not opened for bidding', {
          auctionId: auction.id,
          lotId: al.lotId,
          lotStatus: lot.status,
          reason: heldElsewhere.has(al.lotId) ? 'in another open sale' : 'not approved',
        });
      }
      return ok;
    });

  // Staggered close times. Kept as per-row Drizzle updates (identical Date
  // serialization to the rest of the codebase) but pool-parallel instead of
  // sequential — a 300-lot sale finishes in a couple of seconds instead of
  // eating most of the cron's budget.
  const CHUNK = 10;
  for (let i = 0; i < biddable.length; i += CHUNK) {
    await Promise.all(
      biddable.slice(i, i + CHUNK).map(({ auctionLot: al, closingAt }) =>
        db.update(auctionLots).set({ closingAt }).where(eq(auctionLots.id, al.id)),
      ),
    );
  }

  // Seed all Redis bid states in one pipelined round trip.
  await initializeLotBidStates(
    biddable.map(({ auctionLot: al, lot, closingAt }) => ({
      lotId: al.lotId,
      closeTime: closingAt,
      startingBid: lot.startingBid ?? 0,
      fresh: freshIds.has(al.lotId),
    })),
  );

  return biddable.length;
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

  if (openLots.length === 0) return;

  const nowSeconds = Math.floor(now.getTime() / 1000);

  // One set-based Postgres update + one pipelined Redis round trip.
  await db
    .update(auctionLots)
    .set({ closingAt: now })
    .where(inArray(auctionLots.id, openLots.map((al) => al.id)));

  try {
    const pipeline = redis.pipeline();
    for (const al of openLots) {
      pipeline.set(`bid:lot:${al.lotId}:close_time`, nowSeconds);
    }
    await pipeline.exec();
  } catch (err) {
    logger.error('Failed to collapse Redis close times on early end', err, {
      auctionId,
    });
  }
}

/**
 * Remove every Redis key that makes up a lot's bid state (current bid, bid
 * count, close time, settlement seal). Used when a sale is cancelled or a lot
 * is withdrawn so a later re-auction seeds fresh state instead of inheriting
 * a stale close time or seal. Best-effort: a Redis hiccup is logged, not thrown,
 * because the Postgres side of the change has already committed.
 */
export async function clearLotBidState(lotIds: string[]): Promise<void> {
  if (lotIds.length === 0) return;
  try {
    const pipeline = redis.pipeline();
    for (const lotId of lotIds) {
      pipeline.del(
        `bid:lot:${lotId}:current`,
        `bid:lot:${lotId}:current:bid_count`,
        `bid:lot:${lotId}:close_time`,
        settlingKeyFor(lotId),
      );
    }
    await pipeline.exec();
  } catch (err) {
    logger.error('Failed to clear Redis bid state', err, { lotIds });
  }
}

export type CancelAuctionResult = { ok: true; lotsReleased: number } | { ok: false; reason: string };

/**
 * Cancel a sale. Always allowed before bidding opens; once open or live it is
 * only allowed while no bids exist (a sale with bids must be ended and settled
 * instead, so every bidder's record stays intact). Lots that were opened go
 * back to `approved`, their per-lot close times are cleared, armed max-bids are
 * retired, and their Redis bid state is dropped — but only lots this sale
 * actually holds: a sold lot, or one that another unfinished sale also holds,
 * is left exactly as it is.
 */
export async function cancelAuction(auction: Auction, now: Date = new Date()): Promise<CancelAuctionResult> {
  if (auction.status === 'cancelled' || auction.status === 'completed') {
    return { ok: false, reason: `This auction is already ${auction.status}.` };
  }
  if (auction.status === 'closing' || auction.status === 'closed') {
    return { ok: false, reason: 'Bidding has ended and settlement is in progress — this auction can no longer be cancelled.' };
  }

  if (auction.status === 'open' || auction.status === 'live') {
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(bids)
      .where(and(eq(bids.auctionId, auction.id), inArray(bids.status, ['active', 'winning', 'won'])));
    if (Number(count) > 0) {
      return { ok: false, reason: 'Bids have already been placed. End bidding and let the sale settle instead of cancelling.' };
    }
  }

  const placements = await db
    .select({ lotId: auctionLots.lotId, status: lots.status })
    .from(auctionLots)
    .innerJoin(lots, eq(lots.id, auctionLots.lotId))
    .where(eq(auctionLots.auctionId, auction.id));

  // A LiveAuctioneers sale takes no bids here, so the check above never
  // trips; a recorded hammer price is its equivalent.
  if (!isOnSiteBiddingSale(auction) && placements.some((p) => p.status === 'sold')) {
    return { ok: false, reason: 'LiveAuctioneers results are already recorded for this sale. Record the rest instead of cancelling.' };
  }

  const candidates = placements
    .filter((p) => p.status === 'approved' || p.status === 'in_auction')
    .map((p) => p.lotId);
  const heldElsewhere = await lotsHeldByOtherSales(candidates, auction.id);
  const releasable = candidates.filter((id) => !heldElsewhere.has(id));

  await db.transaction(async (tx) => {
    if (releasable.length > 0) {
      await tx
        .update(lots)
        .set({ status: 'approved', currentBidAmount: 0, currentBidderId: null, bidCount: 0, updatedAt: now })
        .where(and(inArray(lots.id, releasable), inArray(lots.status, ['approved', 'in_auction'])));
      await tx
        .update(maxBids)
        .set({ isActive: false, updatedAt: now })
        .where(and(inArray(maxBids.lotId, releasable), eq(maxBids.isActive, true)));
    }
    // This sale's own close times only; other placements are untouched.
    await tx.update(auctionLots).set({ closingAt: null }).where(eq(auctionLots.auctionId, auction.id));
    await tx
      .update(auctions)
      .set({ status: 'cancelled', actualEndedAt: now, updatedAt: now })
      .where(eq(auctions.id, auction.id));
  });

  await clearLotBidState(releasable);
  return { ok: true, lotsReleased: releasable.length };
}

/**
 * Withdraw a lot from sale. If it is placed in any auction that has not yet
 * settled, it is detached from that sale, its bids are retracted, armed
 * max-bids are retired, and its Redis bid state is removed. The lot ends up
 * `withdrawn` with zeroed bid counters. Historical placements in completed or
 * cancelled sales are left untouched.
 */
export class LotWithdrawBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LotWithdrawBlockedError';
  }
}

export async function withdrawLot(
  lotId: string,
  now: Date = new Date(),
): Promise<{ removedFromAuctions: number; retractedBids: number }> {
  const placements = await db
    .select({
      id: auctionLots.id,
      auctionId: auctionLots.auctionId,
      auctionStatus: auctions.status,
      liveauctioneersUrl: auctions.liveauctioneersUrl,
    })
    .from(auctionLots)
    .innerJoin(auctions, eq(auctions.id, auctionLots.auctionId))
    .where(and(eq(auctionLots.lotId, lotId), notInArray(auctions.status, ['completed', 'cancelled'])));

  // Once a sale is settling, the cron may already have chosen a winner and
  // generated an invoice for this lot; pulling it now would race that work
  // (retract the winning bid while the invoice stays payable, or have the
  // cron relist a withdrawn lot). Wait for settlement, then refund instead.
  // A LiveAuctioneers sale is never settled by the cron, so there is no race.
  if (placements.some((p) => (p.auctionStatus === 'closing' || p.auctionStatus === 'closed') && isOnSiteBiddingSale(p))) {
    throw new LotWithdrawBlockedError('This lot is in a sale that is being settled. Wait for settlement to finish, then refund its invoice if needed.');
  }

  const retractedBids = await db.transaction(async (tx) => {
    // A gallery piece reserved by a live invoice (a Buy Now checkout or a
    // client's invoice) must not be pulled from under it. Checked under the
    // lot's row lock, which the checkout takes too.
    await tx.select({ id: lots.id }).from(lots).where(eq(lots.id, lotId)).for('update');
    const live = await findLiveInvoiceForLot(tx, lotId);
    if (live) {
      throw new LotWithdrawBlockedError(
        `This piece is reserved by invoice ${live.invoiceNumber} (${live.holdExpiresAt ? 'an online checkout in progress' : 'awaiting a client’s payment'}). Cancel that invoice first.`,
      );
    }

    let retracted = 0;
    for (const placement of placements) {
      const rows = await tx
        .update(bids)
        .set({ status: 'retracted' })
        .where(and(
          eq(bids.lotId, lotId),
          eq(bids.auctionId, placement.auctionId),
          inArray(bids.status, ['active', 'winning']),
        ))
        .returning({ id: bids.id });
      retracted += rows.length;
      await tx.delete(auctionLots).where(eq(auctionLots.id, placement.id));
      await tx
        .update(auctions)
        .set({ lotCount: sql`greatest(${auctions.lotCount} - 1, 0)`, updatedAt: now })
        .where(eq(auctions.id, placement.auctionId));
    }
    await tx
      .update(maxBids)
      .set({ isActive: false, updatedAt: now })
      .where(and(eq(maxBids.lotId, lotId), eq(maxBids.isActive, true)));
    await tx
      .update(lots)
      .set({
        status: 'withdrawn',
        currentBidAmount: 0,
        currentBidderId: null,
        bidCount: 0,
        winnerId: null,
        hammerPrice: null,
        updatedAt: now,
      })
      .where(eq(lots.id, lotId));
    return retracted;
  });

  await clearLotBidState([lotId]);
  return { removedFromAuctions: placements.length, retractedBids };
}

/**
 * Move an open auction's close time. Per-lot close times (and the Redis close
 * gate) were fixed when the sale opened, so editing `biddingEndsAt` alone would
 * change what the site displays without changing when bidding actually stops.
 * Re-staggers every lot still in play from the new base time. Deliberately
 * overrides any anti-snipe extensions in flight — an admin reschedule is an
 * explicit decision. Returns the number of lots moved.
 */
export async function rescheduleAuctionClose(auction: Auction, newEnd: Date): Promise<number> {
  const aLots = await db
    .select({ auctionLot: auctionLots, lotStatus: lots.status })
    .from(auctionLots)
    .innerJoin(lots, eq(lots.id, auctionLots.lotId))
    .where(eq(auctionLots.auctionId, auction.id))
    .orderBy(asc(auctionLots.lotNumber));

  const intervalSeconds = auction.lotClosingIntervalSeconds ?? 0;
  const targets = aLots
    .map(({ auctionLot, lotStatus }, index) => ({
      auctionLot,
      closingAt: new Date(newEnd.getTime() + index * intervalSeconds * 1000),
      open: lotStatus === 'in_auction',
    }))
    .filter((t) => t.open);

  if (targets.length === 0) return 0;

  const CHUNK = 10;
  for (let i = 0; i < targets.length; i += CHUNK) {
    await Promise.all(
      targets.slice(i, i + CHUNK).map((t) =>
        db.update(auctionLots).set({ closingAt: t.closingAt }).where(eq(auctionLots.id, t.auctionLot.id)),
      ),
    );
  }

  try {
    const pipeline = redis.pipeline();
    for (const t of targets) {
      pipeline.set(`bid:lot:${t.auctionLot.lotId}:close_time`, Math.floor(t.closingAt.getTime() / 1000));
    }
    await pipeline.exec();
  } catch (err) {
    logger.error('Failed to push rescheduled close times to Redis', err, { auctionId: auction.id });
  }

  return targets.length;
}
