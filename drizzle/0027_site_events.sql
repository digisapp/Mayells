CREATE TYPE "public"."site_event_type" AS ENUM('view', 'call', 'form_start', 'chat');--> statement-breakpoint
CREATE TABLE "site_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site" text NOT NULL,
	"type" "site_event_type" NOT NULL,
	"path" text,
	"entry" boolean DEFAULT false NOT NULL,
	"placement" text,
	"referrer_host" text,
	"utm_source" text,
	"utm_medium" text,
	"utm_campaign" text,
	"device" text,
	"country" text,
	"region" text,
	"city" text,
	"visitor_hash" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "site_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "site_events_created_idx" ON "site_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "site_events_site_created_idx" ON "site_events" USING btree ("site","created_at");--> statement-breakpoint
-- Carry the city microsites' history over. Each microsite view was a page
-- load of a one-page site, so every view began a visit.
INSERT INTO "site_events" ("site", "type", "path", "entry", "placement", "referrer_host", "utm_source", "utm_medium", "utm_campaign", "device", "visitor_hash", "created_at")
SELECT "site", "type"::text::"site_event_type", '/', "type" = 'view', "placement", "referrer_host", "utm_source", "utm_medium", "utm_campaign", "device", "visitor_hash", "created_at"
FROM "microsite_events";
