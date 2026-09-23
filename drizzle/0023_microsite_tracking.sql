CREATE TYPE "public"."microsite_event_type" AS ENUM('view', 'call', 'form_start');--> statement-breakpoint
CREATE TABLE "microsite_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site" text NOT NULL,
	"type" "microsite_event_type" NOT NULL,
	"placement" text,
	"referrer_host" text,
	"utm_source" text,
	"utm_medium" text,
	"utm_campaign" text,
	"device" text,
	"visitor_hash" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "microsite_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "seller_prospects" ADD COLUMN "site" text;--> statement-breakpoint
CREATE INDEX "microsite_events_site_created_idx" ON "microsite_events" USING btree ("site","created_at");--> statement-breakpoint
CREATE INDEX "microsite_events_created_idx" ON "microsite_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "seller_prospects_site_idx" ON "seller_prospects" USING btree ("site");--> statement-breakpoint
-- Leads that arrived before the column existed recorded the city only in
-- source_notes ("Submitted via the <slug> city microsite").
UPDATE "seller_prospects" SET "site" = substring("source_notes" from 'Submitted via the ([a-z0-9-]+) city microsite') WHERE "site" IS NULL AND "source_notes" LIKE 'Submitted via the % city microsite%';
