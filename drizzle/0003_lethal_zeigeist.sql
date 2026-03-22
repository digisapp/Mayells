CREATE TYPE "public"."prospect_source" AS ENUM('phone', 'email', 'website', 'referral', 'estate_visit', 'walk_in', 'other');--> statement-breakpoint
CREATE TYPE "public"."prospect_status" AS ENUM('new', 'contacted', 'upload_sent', 'items_received', 'under_review', 'agreement_sent', 'agreement_signed', 'accepted', 'declined', 'archived');--> statement-breakpoint
CREATE TYPE "public"."upload_item_status" AS ENUM('uploaded', 'processing', 'cataloged', 'accepted', 'declined', 'lot_created');--> statement-breakpoint
CREATE TYPE "public"."upload_link_status" AS ENUM('active', 'expired', 'completed');--> statement-breakpoint
CREATE TABLE "seller_prospects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"full_name" text NOT NULL,
	"email" text,
	"phone" text,
	"company" text,
	"address" text,
	"city" text,
	"state" text,
	"zip" text,
	"country" text DEFAULT 'US',
	"source" "prospect_source" DEFAULT 'email' NOT NULL,
	"source_notes" text,
	"status" "prospect_status" DEFAULT 'new' NOT NULL,
	"estimated_item_count" integer,
	"item_summary" text,
	"notes" text,
	"total_items" integer DEFAULT 0 NOT NULL,
	"reviewed_items" integer DEFAULT 0 NOT NULL,
	"accepted_items" integer DEFAULT 0 NOT NULL,
	"total_estimate_low" integer DEFAULT 0 NOT NULL,
	"total_estimate_high" integer DEFAULT 0 NOT NULL,
	"agreed_commission_percent" integer,
	"agreement_sent_at" timestamp,
	"agreement_signed_at" timestamp,
	"agreement_ip" text,
	"user_id" uuid,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "upload_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"upload_link_id" uuid NOT NULL,
	"prospect_id" uuid NOT NULL,
	"images" text[] DEFAULT '{}',
	"seller_notes" text,
	"seller_title" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"group_label" text,
	"ai_title" text,
	"ai_subtitle" text,
	"ai_description" text,
	"ai_artist" text,
	"ai_maker" text,
	"ai_period" text,
	"ai_circa" text,
	"ai_origin" text,
	"ai_medium" text,
	"ai_dimensions" text,
	"ai_condition" text,
	"ai_condition_notes" text,
	"ai_category" text,
	"ai_tags" text[],
	"ai_estimate_low" integer,
	"ai_estimate_high" integer,
	"ai_confidence" text,
	"ai_reasoning" text,
	"ai_market_trend" text,
	"ai_recommended_reserve" integer,
	"ai_suggested_starting_bid" integer,
	"ai_processed_at" timestamp,
	"upload_item_status" "upload_item_status" DEFAULT 'uploaded' NOT NULL,
	"admin_notes" text,
	"reviewed_at" timestamp,
	"final_title" text,
	"final_description" text,
	"final_estimate_low" integer,
	"final_estimate_high" integer,
	"final_reserve" integer,
	"final_category" text,
	"lot_id" uuid,
	"auction_id" uuid,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "upload_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"prospect_id" uuid NOT NULL,
	"token" text NOT NULL,
	"upload_link_status" "upload_link_status" DEFAULT 'active' NOT NULL,
	"max_items" integer,
	"expires_at" timestamp,
	"item_count" integer DEFAULT 0 NOT NULL,
	"last_upload_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "upload_links_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "upload_items" ADD CONSTRAINT "upload_items_upload_link_id_upload_links_id_fk" FOREIGN KEY ("upload_link_id") REFERENCES "public"."upload_links"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upload_items" ADD CONSTRAINT "upload_items_prospect_id_seller_prospects_id_fk" FOREIGN KEY ("prospect_id") REFERENCES "public"."seller_prospects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upload_links" ADD CONSTRAINT "upload_links_prospect_id_seller_prospects_id_fk" FOREIGN KEY ("prospect_id") REFERENCES "public"."seller_prospects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "seller_prospects_status_idx" ON "seller_prospects" USING btree ("status");--> statement-breakpoint
CREATE INDEX "seller_prospects_email_idx" ON "seller_prospects" USING btree ("email");--> statement-breakpoint
CREATE INDEX "seller_prospects_created_idx" ON "seller_prospects" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "upload_items_link_idx" ON "upload_items" USING btree ("upload_link_id");--> statement-breakpoint
CREATE INDEX "upload_items_prospect_idx" ON "upload_items" USING btree ("prospect_id");--> statement-breakpoint
CREATE INDEX "upload_items_status_idx" ON "upload_items" USING btree ("upload_item_status");--> statement-breakpoint
CREATE INDEX "upload_links_token_idx" ON "upload_links" USING btree ("token");--> statement-breakpoint
CREATE INDEX "upload_links_prospect_idx" ON "upload_links" USING btree ("prospect_id");