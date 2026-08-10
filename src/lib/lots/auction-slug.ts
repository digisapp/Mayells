import { sql } from 'drizzle-orm';

/**
 * Correlated scalar subquery resolving the most relevant auction slug for a
 * lot — preferring live/open, then upcoming, then recently ended. Mirrors the
 * ranking in the /lots/[lotId] redirect resolver; selecting this alongside lot
 * rows lets LotCard link straight to /auctions/{slug}/lots/{lot} instead of
 * paying that resolver's 2 queries + 307 on every card click.
 *
 * The outer reference is written literally as "lots"."id" — interpolating the
 * Drizzle column renders unqualified ("id") inside the subquery, which
 * Postgres rejects as ambiguous. Only valid in queries FROM the lots table.
 */
export const bestAuctionSlugSql = sql<string | null>`(
  SELECT a.slug FROM auction_lots al
  JOIN auctions a ON a.id = al.auction_id
  WHERE al.lot_id = "lots"."id"
  ORDER BY CASE a.status
    WHEN 'live' THEN 0
    WHEN 'open' THEN 0
    WHEN 'preview' THEN 1
    WHEN 'scheduled' THEN 1
    WHEN 'closing' THEN 2
    WHEN 'closed' THEN 2
    ELSE 3 END,
    a.bidding_ends_at DESC NULLS LAST
  LIMIT 1
)`.as('auction_slug');
