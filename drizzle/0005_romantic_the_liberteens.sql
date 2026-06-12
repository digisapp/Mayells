DROP INDEX "max_bids_lot_bidder_idx";--> statement-breakpoint
DROP INDEX "invoices_lot_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "auction_lots_auction_lot_unique_idx" ON "auction_lots" USING btree ("auction_id","lot_id");--> statement-breakpoint
CREATE UNIQUE INDEX "max_bids_lot_bidder_unique_idx" ON "max_bids" USING btree ("lot_id","bidder_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_lot_unique_idx" ON "invoices" USING btree ("lot_id") WHERE status <> 'cancelled';