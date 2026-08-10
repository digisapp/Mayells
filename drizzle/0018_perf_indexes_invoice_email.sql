ALTER TABLE "invoices" ADD COLUMN "email_sent_at" timestamp;--> statement-breakpoint
CREATE INDEX "lots_created_at_idx" ON "lots" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "auction_lots_closing_at_idx" ON "auction_lots" USING btree ("closing_at") WHERE closing_at is not null;--> statement-breakpoint
CREATE INDEX "bids_created_at_idx" ON "bids" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "emails_in_reply_to_idx" ON "emails" USING btree ("in_reply_to_id");--> statement-breakpoint
-- Backfill: invoices that existed before this column were (or should have
-- been) emailed at settlement time. Stamp them so the new unsent-email retry
-- sweep in the lifecycle cron doesn't re-email every historical buyer.
UPDATE "invoices" SET "email_sent_at" = COALESCE("created_at", now()) WHERE "email_sent_at" IS NULL;