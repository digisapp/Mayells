ALTER TYPE "public"."payment_method" ADD VALUE 'check';--> statement-breakpoint
ALTER TYPE "public"."payment_method" ADD VALUE 'other';--> statement-breakpoint
ALTER TYPE "public"."payout_status" ADD VALUE 'reversed';--> statement-breakpoint
ALTER TYPE "public"."shipment_status" ADD VALUE 'needs_address' BEFORE 'label_created';--> statement-breakpoint
ALTER TYPE "public"."shipment_status" ADD VALUE 'cancelled';--> statement-breakpoint
DROP INDEX "invoices_lot_unique_idx";--> statement-breakpoint
DROP INDEX "payouts_lot_unique_idx";--> statement-breakpoint
ALTER TABLE "outreach_contacts" ALTER COLUMN "next_follow_up_at" SET DATA TYPE date USING "next_follow_up_at"::date;--> statement-breakpoint
ALTER TABLE "shipments" ALTER COLUMN "from_street" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "shipments" ALTER COLUMN "from_city" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "shipments" ALTER COLUMN "from_state" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "shipments" ALTER COLUMN "from_zip" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "shipments" ALTER COLUMN "to_street" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "shipments" ALTER COLUMN "to_city" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "shipments" ALTER COLUMN "to_state" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "shipments" ALTER COLUMN "to_zip" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "admin_notes" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "reference" text;--> statement-breakpoint
ALTER TABLE "payouts" ADD COLUMN "commission_source" text;--> statement-breakpoint
ALTER TABLE "estate_visits" ADD COLUMN "prospect_id" uuid;--> statement-breakpoint
ALTER TABLE "emails" ADD COLUMN "archived_at" timestamp;--> statement-breakpoint
ALTER TABLE "shipments" ADD COLUMN "seller_notified_at" timestamp;--> statement-breakpoint
ALTER TABLE "shipments" ADD COLUMN "buyer_notified_at" timestamp;--> statement-breakpoint
ALTER TABLE "webhook_logs" ADD COLUMN "replay_of_id" uuid;--> statement-breakpoint
CREATE INDEX "emails_archived_at_idx" ON "emails" USING btree ("archived_at");--> statement-breakpoint
-- Settings is a singleton; earlier code could insert a second row under a race. Keep the newest.
DELETE FROM "automation_settings" WHERE "id" NOT IN (SELECT "id" FROM "automation_settings" ORDER BY "updated_at" DESC NULLS LAST, "id" LIMIT 1);--> statement-breakpoint
CREATE UNIQUE INDEX "automation_settings_singleton_idx" ON "automation_settings" USING btree ((true));--> statement-breakpoint
CREATE INDEX "whl_replay_of_idx" ON "webhook_logs" USING btree ("replay_of_id") WHERE "webhook_logs"."replay_of_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_lot_unique_idx" ON "invoices" USING btree ("lot_id") WHERE status not in ('cancelled', 'refunded');--> statement-breakpoint
CREATE UNIQUE INDEX "payouts_lot_unique_idx" ON "payouts" USING btree ("lot_id") WHERE status in ('pending', 'paid');--> statement-breakpoint
-- Adopt legacy replay rows (event_id 'replay:<ts>:<orig>') into the new replay_of_id link.
UPDATE "webhook_logs" r SET "replay_of_id" = o."id", "event_id" = NULL FROM "webhook_logs" o
  WHERE r."event_id" LIKE 'replay:%' AND o."provider" = r."provider" AND o."event_id" = substring(r."event_id" from '^replay:[0-9]+:(.*)$');
