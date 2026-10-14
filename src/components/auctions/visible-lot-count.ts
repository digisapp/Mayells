import { getTableColumns, sql } from 'drizzle-orm';
import { auctions } from '@/db/schema';
import { PUBLIC_CATALOGUE_LOT_STATUSES } from '@/lib/lots/visibility';
import { takingBidsSql } from '@/lib/auctions/bidding-window';

/**
 * How many lots a visitor will actually find in a sale: its placements whose
 * lot has a catalogue-visible status — the same filter the sale page's grid
 * uses. The denormalized `auctions.lotCount` also counts draft and withdrawn
 * placements, so a card could promise lots the catalogue never shows.
 *
 * A correlated subquery on the outer `auctions` row: select it alongside the
 * auction's columns (see `auctionWithVisibleLotCount`). Identifiers are
 * written literally — interpolated Drizzle columns render unqualified ("id")
 * inside a subquery, which Postgres rejects as ambiguous (same pitfall as
 * src/lib/lots/auction-slug.ts). Only valid in queries FROM auctions.
 */
export const visibleLotCountSql = sql<number>`(
  select count(*) from auction_lots al
  inner join lots l on l.id = al.lot_id
  where al.auction_id = "auctions"."id"
    and l.status in (${sql.join(
      PUBLIC_CATALOGUE_LOT_STATUSES.map((s) => sql`${s}`),
      sql`, `,
    )})
)`.mapWith(Number);

/**
 * Every auction column plus `visibleLotCount`, and `takingBids` (a 'closed'
 * sale whose staggered lot closes are still running reads as open), for
 * `db.select(...)`.
 */
export const auctionWithVisibleLotCount = {
  ...getTableColumns(auctions),
  visibleLotCount: visibleLotCountSql,
  takingBids: takingBidsSql,
};
