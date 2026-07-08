ALTER TABLE "bids" DROP CONSTRAINT "bids_auction_id_auctions_id_fk";
--> statement-breakpoint
ALTER TABLE "bids" DROP CONSTRAINT "bids_lot_id_lots_id_fk";
--> statement-breakpoint
ALTER TABLE "bids" DROP CONSTRAINT "bids_bidder_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "bids" ADD CONSTRAINT "bids_auction_id_auctions_id_fk" FOREIGN KEY ("auction_id") REFERENCES "public"."auctions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bids" ADD CONSTRAINT "bids_lot_id_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."lots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bids" ADD CONSTRAINT "bids_bidder_id_users_id_fk" FOREIGN KEY ("bidder_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lots_consignment_idx" ON "lots" USING btree ("consignment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "whl_provider_event_unique_idx" ON "webhook_logs" USING btree ("provider","event_id") WHERE "webhook_logs"."event_id" is not null;