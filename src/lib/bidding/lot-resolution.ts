import { sql } from 'drizzle-orm';
import { auctions } from '@/db/schema';

/** Canonical UUID matcher used to tell a lot id apart from a slug. */
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A relisted lot can belong to more than one auction row. Both the bid route
 * and the lot-state route must pick the SAME "currently-biddable" auction, or
 * the polled state would describe a different auction than the one a bid writes
 * to. This shared ordering (biddable first, then closing/closed, then upcoming,
 * completed/cancelled last; newest end date as the tiebreak) is the single
 * source of that decision.
 */
export const biddableAuctionOrder = [
  sql`CASE ${auctions.status}
    WHEN 'open' THEN 0
    WHEN 'live' THEN 0
    WHEN 'closing' THEN 1
    WHEN 'closed' THEN 1
    WHEN 'scheduled' THEN 2
    WHEN 'preview' THEN 2
    ELSE 3 END`,
];
