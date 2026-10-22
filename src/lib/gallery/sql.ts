import { sql } from 'drizzle-orm';

/**
 * True while a live invoice reserves the lot: an unexpired Buy Now hold, or
 * a client's invoice awaiting payment. For gallery grids (queries FROM lots).
 *
 * hold_expires_at is a zone-less column holding UTC (how Drizzle writes a
 * Date), so it is compared with the UTC wall clock, whatever the session
 * time zone is.
 *
 * The outer reference is written literally as "lots"."id": an interpolated
 * Drizzle column renders unqualified inside a raw subquery and would resolve
 * to the invoice's own id column.
 */
export const lotReservedSql = sql<boolean>`exists (
  select 1 from invoices i
  where i.lot_id = "lots"."id"
    and i.status in ('pending', 'overdue')
    and (i.hold_expires_at is null or i.hold_expires_at > (now() at time zone 'utc'))
)`;
