import { and, eq, inArray, ne } from 'drizzle-orm';
import { db } from '@/db';
import { auctionLots, auctions } from '@/db/schema';
import { PUBLIC_AUCTION_STATUSES } from '@/lib/auctions/visibility';

type Executor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Sale statuses in which a placement still holds its lot: everything short of
 * `completed` (settled) and `cancelled`. A lot belongs to at most one such
 * sale at a time. Two would mean two bidding ladders, two settlements and an
 * invoice for the wrong buyer.
 */
export const ACTIVE_SALE_STATUSES = [
  'draft', 'scheduled', 'preview', 'open', 'live', 'closing', 'closed',
] as const;

/**
 * The unfinished sale (other than `exceptAuctionId`) that holds this lot, or
 * null. Callers: catalogue a lot only when this is null; reset a lot's status
 * on removal only when this is null.
 */
export async function findActivePlacement(
  lotId: string,
  opts: { exceptAuctionId?: string; executor?: Executor } = {},
): Promise<{ auctionId: string; auctionTitle: string; auctionStatus: string } | null> {
  const executor = opts.executor ?? db;
  const [row] = await executor
    .select({ auctionId: auctions.id, auctionTitle: auctions.title, auctionStatus: auctions.status })
    .from(auctionLots)
    .innerJoin(auctions, eq(auctions.id, auctionLots.auctionId))
    .where(
      and(
        eq(auctionLots.lotId, lotId),
        inArray(auctions.status, [...ACTIVE_SALE_STATUSES]),
        opts.exceptAuctionId ? ne(auctions.id, opts.exceptAuctionId) : undefined,
      ),
    )
    .limit(1);
  return row ?? null;
}

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
