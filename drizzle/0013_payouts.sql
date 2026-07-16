CREATE TYPE "public"."payout_method" AS ENUM('wire', 'check', 'stripe', 'other');--> statement-breakpoint
CREATE TYPE "public"."payout_status" AS ENUM('pending', 'paid', 'cancelled');--> statement-breakpoint
CREATE TABLE "payouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"lot_id" uuid NOT NULL,
	"seller_id" uuid NOT NULL,
	"hammer_price" integer NOT NULL,
	"commission_percent" integer NOT NULL,
	"commission_amount" integer NOT NULL,
	"net_amount" integer NOT NULL,
	"status" "payout_status" DEFAULT 'pending' NOT NULL,
	"method" "payout_method",
	"reference" text,
	"notes" text,
	"paid_at" timestamp,
	"paid_by_id" uuid,
	"statement_sent_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_lot_id_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."lots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_seller_id_users_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_paid_by_id_users_id_fk" FOREIGN KEY ("paid_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payouts_seller_idx" ON "payouts" USING btree ("seller_id");--> statement-breakpoint
CREATE INDEX "payouts_status_idx" ON "payouts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "payouts_invoice_idx" ON "payouts" USING btree ("invoice_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payouts_lot_unique_idx" ON "payouts" USING btree ("lot_id") WHERE status <> 'cancelled';--> statement-breakpoint
-- ── Backfill seller-of-record for prospect-created lots ──
-- Historically, lots created from seller prospects were inserted with a null
-- seller_id (the consignor had no account), which blocked shipping and made
-- payouts impossible. Link prospects to existing accounts by email, mint
-- shadow seller users for the rest, and stamp their lots.
UPDATE "seller_prospects" sp
SET "user_id" = u."id"
FROM "users" u
WHERE sp."user_id" IS NULL
  AND sp."email" IS NOT NULL
  AND lower(u."email") = lower(sp."email");--> statement-breakpoint
WITH candidates AS (
  SELECT DISTINCT ON (COALESCE(lower(sp."email"), sp."id"::text))
    sp."id", sp."email", sp."full_name", sp."phone", sp."company",
    sp."address", sp."city", sp."state", sp."zip", sp."country"
  FROM "seller_prospects" sp
  WHERE sp."user_id" IS NULL
    AND EXISTS (
      SELECT 1 FROM "upload_items" ui
      WHERE ui."prospect_id" = sp."id" AND ui."lot_id" IS NOT NULL
    )
  ORDER BY COALESCE(lower(sp."email"), sp."id"::text), sp."created_at"
), minted AS (
  INSERT INTO "users" (
    "id", "email", "full_name", "role", "phone", "company_name",
    "shipping_address", "shipping_city", "shipping_state", "shipping_zip", "shipping_country"
  )
  SELECT gen_random_uuid(),
         COALESCE(c."email", 'prospect-' || c."id" || '@no-email.mayells.invalid'),
         c."full_name", 'seller', c."phone", c."company",
         c."address", c."city", c."state", c."zip", COALESCE(c."country", 'US')
  FROM candidates c
  RETURNING "id", "email"
)
UPDATE "seller_prospects" sp
SET "user_id" = m."id"
FROM minted m
WHERE sp."user_id" IS NULL
  AND lower(COALESCE(sp."email", 'prospect-' || sp."id" || '@no-email.mayells.invalid')) = lower(m."email");--> statement-breakpoint
UPDATE "lots" l
SET "seller_id" = sp."user_id"
FROM "upload_items" ui
JOIN "seller_prospects" sp ON sp."id" = ui."prospect_id"
WHERE l."seller_id" IS NULL
  AND ui."lot_id" = l."id"
  AND sp."user_id" IS NOT NULL;