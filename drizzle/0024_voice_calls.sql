CREATE TYPE "public"."call_channel" AS ENUM('phone', 'web');--> statement-breakpoint
CREATE TYPE "public"."call_outcome" AS ENUM('info', 'lead', 'transferred');--> statement-breakpoint
CREATE TABLE "calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel" "call_channel" NOT NULL,
	"room_name" text NOT NULL,
	"caller_number" text,
	"called_number" text,
	"site" text,
	"prospect_id" uuid,
	"outcome" "call_outcome" DEFAULT 'info' NOT NULL,
	"transcript" jsonb,
	"summary" text,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"ended_at" timestamp,
	"duration_seconds" integer,
	CONSTRAINT "calls_room_name_unique" UNIQUE("room_name")
);
--> statement-breakpoint
ALTER TABLE "calls" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "calls" ADD CONSTRAINT "calls_prospect_id_seller_prospects_id_fk" FOREIGN KEY ("prospect_id") REFERENCES "public"."seller_prospects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "calls_started_idx" ON "calls" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "calls_prospect_idx" ON "calls" USING btree ("prospect_id");--> statement-breakpoint
CREATE INDEX "calls_site_started_idx" ON "calls" USING btree ("site","started_at");