import { sql } from 'drizzle-orm';
import { auctionLots } from '@/db/schema';

/**
 * Sale statuses in which a lot can still take bids. The lot's own close time
 * (staggered closing + anti-snipe) decides, not the sale row: the settlement
 * cron flips a sale to 'closed' at biddingEndsAt while its later lots are
 * still open, so 'closed' stays biddable. 'closing' is an early end whose lots
 * were all force-closed. Mirrors the bid route's own check.
 */
export const BIDDING_SALE_STATUSES = ['open', 'live', 'closed'] as const;

/**
 * Latest effective close among a sale's lots still in play (`in_auction`):
 * the per-lot `closingAt`, else the sale's end. Null when no lot is in play.
 *
 * Correlated on the outer `auctions` row, so only valid in queries FROM
 * auctions. Identifiers are written literally — interpolated Drizzle columns
 * render unqualified ("id") inside a subquery, which Postgres rejects as
 * ambiguous (see src/lib/lots/auction-slug.ts).
 */
export const lastLotCloseSql = sql<Date | null>`(
  select max(coalesce(al.closing_at, "auctions"."bidding_ends_at"))
  from auction_lots al
  inner join lots l on l.id = al.lot_id
  where al.auction_id = "auctions"."id"
    and l.status = 'in_auction'
)`.mapWith(auctionLots.closingAt);

/**
 * Whether the sale is taking bids right now: open or live, or 'closed' with a
 * lot whose close time is still ahead (a staggered close in progress). Same
 * correlation rules as `lastLotCloseSql`. Usable in a select or a where.
 */
export const takingBidsSql = sql<boolean>`(
  "auctions"."status" in ('open', 'live')
  or ("auctions"."status" = 'closed' and exists (
    select 1 from auction_lots al
    inner join lots l on l.id = al.lot_id
    where al.auction_id = "auctions"."id"
      and l.status = 'in_auction'
      and coalesce(al.closing_at, "auctions"."bidding_ends_at") > now()
  ))
)`.mapWith(Boolean);

export type SalePhase = 'upcoming' | 'bidding' | 'past';

/**
 * Where a sale sits for the public: not yet open, taking bids, or over.
 * `takingBids` comes from `takingBidsSql`; it only matters for 'closed',
 * which reads as still bidding while any lot is open.
 */
export function salePhase(status: string, takingBids: boolean): SalePhase {
  switch (status) {
    case 'draft':
    case 'scheduled':
    case 'preview':
      return 'upcoming';
    case 'open':
    case 'live':
      return 'bidding';
    case 'closed':
      return takingBids ? 'bidding' : 'past';
    // 'closing' (ended early, every lot force-closed), 'completed', 'cancelled'.
    default:
      return 'past';
  }
}
