CREATE TYPE "public"."invoice_source" AS ENUM('auction', 'gallery');--> statement-breakpoint
ALTER TABLE "lots" ADD COLUMN "online_checkout" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "lots" ADD COLUMN "shipping_price" integer;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "source" "invoice_source" DEFAULT 'auction' NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "hold_expires_at" timestamp;--> statement-breakpoint
CREATE INDEX "invoices_hold_expires_idx" ON "invoices" USING btree ("hold_expires_at") WHERE hold_expires_at is not null and status = 'pending';--> statement-breakpoint
-- Every invoice so far came from settling an auction lot, which always sets
-- auction_id. One without a sale can only be a gallery sale.
UPDATE "invoices" SET "source" = 'gallery' WHERE "auction_id" IS NULL;
