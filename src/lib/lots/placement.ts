import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { auctionLots, auctions } from '@/db/schema';
import { PUBLIC_AUCTION_STATUSES } from '@/lib/auctions/visibility';

/**
 * A lot sits in the catalogue of a public sale (scheduled/preview/open/…)
 * while its own status is still `approved` — bidding only flips it to
 * `in_auction` when the sale opens. Public surfaces use this to decide
 * whether such a lot may be shown; see `isPubliclyVisibleLot`.
 */
export async function isLotInPublicAuction(lotId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: auctionLots.id })
    .from(auctionLots)
    .innerJoin(auctions, eq(auctions.id, auctionLots.auctionId))
    .where(and(eq(auctionLots.lotId, lotId), inArray(auctions.status, [...PUBLIC_AUCTION_STATUSES])))
    .limit(1);
  return !!row;
}

/** The lot's current placement (for the admin lot editor), newest sale first. */
export async function getLotPlacements(lotId: string) {
  return db
    .select({
      auctionId: auctions.id,
      auctionTitle: auctions.title,
      auctionSlug: auctions.slug,
      auctionStatus: auctions.status,
      auctionType: auctions.type,
      lotNumber: auctionLots.lotNumber,
      closingAt: auctionLots.closingAt,
      biddingEndsAt: auctions.biddingEndsAt,
    })
    .from(auctionLots)
    .innerJoin(auctions, eq(auctions.id, auctionLots.auctionId))
    .where(eq(auctionLots.lotId, lotId))
    .orderBy(auctions.createdAt);
}
