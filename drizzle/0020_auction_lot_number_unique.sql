-- Lot numbers must be unique within an auction. The admin UI computes the
-- "next" number client-side, so two admins assigning at the same moment could
-- previously create two "Lot 12"s; the unique index makes Postgres the arbiter
-- (the assign route maps the conflict to a 409 and the UI refreshes).
--
-- Preflight: refuse to run while duplicates exist, and say which — fix them in
-- /admin/auctions/<id> (remove + re-assign) and re-run the migration.
DO $$
DECLARE dupes text;
BEGIN
  SELECT string_agg(format('auction %s lot #%s (x%s)', auction_id, lot_number, n), ', ')
    INTO dupes
    FROM (
      SELECT auction_id, lot_number, count(*) AS n
        FROM auction_lots
       GROUP BY auction_id, lot_number
      HAVING count(*) > 1
    ) d;
  IF dupes IS NOT NULL THEN
    RAISE EXCEPTION 'auction_lot_number_unique aborted: duplicate lot numbers exist: %', dupes;
  END IF;
END $$;
--> statement-breakpoint
DROP INDEX "auction_lots_auction_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "auction_lots_auction_lot_number_unique_idx" ON "auction_lots" USING btree ("auction_id","lot_number");