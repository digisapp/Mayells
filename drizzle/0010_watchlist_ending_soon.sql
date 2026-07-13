ALTER TABLE "watchlist" ADD COLUMN "ending_soon_notified_at" timestamp;--> statement-breakpoint
CREATE INDEX "watchlist_lot_idx" ON "watchlist" USING btree ("lot_id");