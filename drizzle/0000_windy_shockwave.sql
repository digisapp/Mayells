CREATE TYPE "public"."account_status" AS ENUM('active', 'suspended', 'banned');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('buyer', 'seller', 'admin', 'auctioneer');--> statement-breakpoint
CREATE TYPE "public"."lot_condition" AS ENUM('mint', 'excellent', 'very_good', 'good', 'fair', 'poor', 'as_is');--> statement-breakpoint
CREATE TYPE "public"."lot_status" AS ENUM('draft', 'pending_review', 'approved', 'for_sale', 'in_auction', 'sold', 'unsold', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."sale_type" AS ENUM('auction', 'gallery', 'private');--> statement-breakpoint
CREATE TYPE "public"."auction_status" AS ENUM('draft', 'scheduled', 'preview', 'open', 'live', 'closing', 'closed', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."auction_type" AS ENUM('timed', 'live');--> statement-breakpoint
CREATE TYPE "public"."bid_status" AS ENUM('active', 'outbid', 'winning', 'won', 'retracted');--> statement-breakpoint
CREATE TYPE "public"."bid_type" AS ENUM('manual', 'auto', 'phone', 'auctioneer');--> statement-breakpoint
CREATE TYPE "public"."invoice_status" AS ENUM('pending', 'paid', 'overdue', 'cancelled', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('credit_card', 'bank_transfer', 'wire');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('pending', 'processing', 'succeeded', 'failed', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."consignment_status" AS ENUM('submitted', 'under_review', 'approved', 'declined', 'listed', 'sold', 'returned');--> statement-breakpoint
CREATE TYPE "public"."outreach_category" AS ENUM('estate_attorney', 'trust_estate_planning', 'elder_law', 'wealth_management', 'family_office', 'cpa_tax', 'divorce_attorney', 'insurance', 'estate_liquidator', 'real_estate', 'art_advisor', 'bank_trust', 'other');--> statement-breakpoint
CREATE TYPE "public"."outreach_status" AS ENUM('new', 'contacted', 'follow_up', 'interested', 'converted', 'not_interested', 'do_not_contact');--> statement-breakpoint
CREATE TYPE "public"."estate_item_status" AS ENUM('pending', 'processing', 'completed', 'error');--> statement-breakpoint
CREATE TYPE "public"."estate_visit_status" AS ENUM('draft', 'uploading', 'processing', 'review', 'sent', 'archived');--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"full_name" text,
	"display_name" text,
	"avatar_url" text,
	"role" "user_role" DEFAULT 'buyer' NOT NULL,
	"is_admin" boolean DEFAULT false NOT NULL,
	"account_status" "account_status" DEFAULT 'active' NOT NULL,
	"paddle_number" text,
	"phone" text,
	"shipping_address" text,
	"shipping_city" text,
	"shipping_state" text,
	"shipping_zip" text,
	"shipping_country" text DEFAULT 'US',
	"company_name" text,
	"bio" text,
	"stripe_customer_id" text,
	"stripe_connect_account_id" text,
	"email_notifications" boolean DEFAULT true,
	"bid_notifications" boolean DEFAULT true,
	"outbid_notifications" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_paddle_number_unique" UNIQUE("paddle_number"),
	CONSTRAINT "users_stripe_customer_id_unique" UNIQUE("stripe_customer_id"),
	CONSTRAINT "users_stripe_connect_account_id_unique" UNIQUE("stripe_connect_account_id")
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"image_url" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"lot_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "categories_name_unique" UNIQUE("name"),
	CONSTRAINT "categories_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "subcategories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "lots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lot_number" integer,
	"title" text NOT NULL,
	"subtitle" text,
	"description" text NOT NULL,
	"category_id" uuid NOT NULL,
	"subcategory_id" uuid,
	"artist" text,
	"maker" text,
	"period" text,
	"circa" text,
	"origin" text,
	"medium" text,
	"dimensions" text,
	"weight" text,
	"condition" "lot_condition",
	"condition_notes" text,
	"provenance" text,
	"literature" text,
	"exhibited" text,
	"status" "lot_status" DEFAULT 'draft' NOT NULL,
	"sale_type" "sale_type" DEFAULT 'auction' NOT NULL,
	"buy_now_price" integer,
	"estimate_low" integer,
	"estimate_high" integer,
	"reserve_price" integer,
	"starting_bid" integer,
	"seller_id" uuid,
	"consignment_id" uuid,
	"current_bid_amount" integer DEFAULT 0 NOT NULL,
	"current_bidder_id" uuid,
	"bid_count" integer DEFAULT 0 NOT NULL,
	"winner_id" uuid,
	"hammer_price" integer,
	"primary_image_url" text,
	"image_count" integer DEFAULT 0 NOT NULL,
	"is_featured" boolean DEFAULT false NOT NULL,
	"is_highlight" boolean DEFAULT false NOT NULL,
	"ai_description" text,
	"ai_tags" text[],
	"ai_estimate_low" integer,
	"ai_estimate_high" integer,
	"ai_confidence_score" numeric,
	"slug" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "lots_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "lot_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lot_id" uuid NOT NULL,
	"url" text NOT NULL,
	"thumbnail_url" text,
	"alt_text" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"width" integer,
	"height" integer,
	"mime_type" text,
	"size_bytes" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "auction_lots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"auction_id" uuid NOT NULL,
	"lot_id" uuid NOT NULL,
	"lot_number" integer NOT NULL,
	"closing_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "auctions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"subtitle" text,
	"description" text,
	"slug" text NOT NULL,
	"type" "auction_type" DEFAULT 'timed' NOT NULL,
	"status" "auction_status" DEFAULT 'draft' NOT NULL,
	"preview_starts_at" timestamp,
	"bidding_starts_at" timestamp,
	"bidding_ends_at" timestamp,
	"actual_ended_at" timestamp,
	"anti_snipe_enabled" boolean DEFAULT true NOT NULL,
	"anti_snipe_minutes" integer DEFAULT 2 NOT NULL,
	"anti_snipe_window_minutes" integer DEFAULT 5 NOT NULL,
	"lot_closing_interval_seconds" integer DEFAULT 30,
	"cover_image_url" text,
	"banner_image_url" text,
	"lot_count" integer DEFAULT 0 NOT NULL,
	"total_bids" integer DEFAULT 0 NOT NULL,
	"registered_bidders" integer DEFAULT 0 NOT NULL,
	"buyer_premium_percent" integer DEFAULT 25 NOT NULL,
	"livekit_room_name" text,
	"liveauctioneers_url" text,
	"created_by_id" uuid,
	"auctioneer_id" uuid,
	"is_featured" boolean DEFAULT false NOT NULL,
	"sale_number" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "auctions_slug_unique" UNIQUE("slug"),
	CONSTRAINT "auctions_livekit_room_name_unique" UNIQUE("livekit_room_name")
);
--> statement-breakpoint
CREATE TABLE "bids" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"auction_id" uuid NOT NULL,
	"lot_id" uuid NOT NULL,
	"bidder_id" uuid NOT NULL,
	"amount" integer NOT NULL,
	"max_bid_amount" integer,
	"bid_type" "bid_type" DEFAULT 'manual' NOT NULL,
	"bid_status" "bid_status" DEFAULT 'active' NOT NULL,
	"triggered_extension" boolean DEFAULT false,
	"ip_address" text,
	"user_agent" text,
	"idempotency_key" text,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "bids_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "max_bids" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lot_id" uuid NOT NULL,
	"bidder_id" uuid NOT NULL,
	"max_amount" integer NOT NULL,
	"current_proxy_bid" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_number" text NOT NULL,
	"buyer_id" uuid NOT NULL,
	"auction_id" uuid,
	"lot_id" uuid NOT NULL,
	"hammer_price" integer NOT NULL,
	"buyer_premium" integer NOT NULL,
	"shipping_cost" integer DEFAULT 0,
	"insurance_cost" integer DEFAULT 0,
	"tax_amount" integer DEFAULT 0,
	"total_amount" integer NOT NULL,
	"status" "invoice_status" DEFAULT 'pending' NOT NULL,
	"due_date" timestamp NOT NULL,
	"paid_at" timestamp,
	"stripe_payment_intent_id" text,
	"stripe_charge_id" text,
	"shipping_address" text,
	"tracking_number" text,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "invoices_invoice_number_unique" UNIQUE("invoice_number")
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"buyer_id" uuid NOT NULL,
	"amount" integer NOT NULL,
	"method" "payment_method" NOT NULL,
	"status" "payment_status" DEFAULT 'pending' NOT NULL,
	"stripe_payment_intent_id" text,
	"stripe_charge_id" text,
	"failure_reason" text,
	"idempotency_key" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "payments_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "consignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seller_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"category_slug" text NOT NULL,
	"estimated_value" integer,
	"status" "consignment_status" DEFAULT 'submitted' NOT NULL,
	"lot_id" uuid,
	"commission_percent" integer,
	"review_notes" text,
	"reviewed_by_id" uuid,
	"reviewed_at" timestamp,
	"images" text[] DEFAULT '{}',
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "watchlist" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"lot_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "bid_increments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"from_amount" integer NOT NULL,
	"to_amount" integer NOT NULL,
	"increment" integer NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "outreach_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_name" text NOT NULL,
	"contact_name" text,
	"title" text,
	"email" text,
	"phone" text,
	"website" text,
	"category" "outreach_category" DEFAULT 'other' NOT NULL,
	"status" "outreach_status" DEFAULT 'new' NOT NULL,
	"source" text,
	"address" text,
	"city" text,
	"state" text,
	"notes" text,
	"last_contacted_at" timestamp,
	"next_follow_up_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "estate_visit_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"visit_id" uuid NOT NULL,
	"image_url" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"status" "estate_item_status" DEFAULT 'pending' NOT NULL,
	"error_message" text,
	"title" text,
	"description" text,
	"artist" text,
	"period" text,
	"medium" text,
	"dimensions" text,
	"condition" text,
	"condition_notes" text,
	"suggested_category" text,
	"estimate_low" integer,
	"estimate_high" integer,
	"confidence" numeric,
	"reasoning" text,
	"market_trend" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "estate_visits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_name" text NOT NULL,
	"client_email" text,
	"client_phone" text,
	"client_address" text,
	"client_city" text,
	"client_state" text,
	"visit_date" timestamp,
	"notes" text,
	"status" "estate_visit_status" DEFAULT 'draft' NOT NULL,
	"report_token" text NOT NULL,
	"item_count" integer DEFAULT 0 NOT NULL,
	"processed_count" integer DEFAULT 0 NOT NULL,
	"total_estimate_low" integer DEFAULT 0 NOT NULL,
	"total_estimate_high" integer DEFAULT 0 NOT NULL,
	"sent_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "estate_visits_report_token_unique" UNIQUE("report_token")
);
--> statement-breakpoint
CREATE TABLE "newsletter_subscribers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(320) NOT NULL,
	"subscribed_at" timestamp DEFAULT now(),
	"unsubscribed" boolean DEFAULT false
);
--> statement-breakpoint
CREATE TABLE "auction_reminders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"lot_id" uuid NOT NULL,
	"email" varchar(320) NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "subcategories" ADD CONSTRAINT "subcategories_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lots" ADD CONSTRAINT "lots_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lots" ADD CONSTRAINT "lots_subcategory_id_subcategories_id_fk" FOREIGN KEY ("subcategory_id") REFERENCES "public"."subcategories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lots" ADD CONSTRAINT "lots_seller_id_users_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lots" ADD CONSTRAINT "lots_current_bidder_id_users_id_fk" FOREIGN KEY ("current_bidder_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lots" ADD CONSTRAINT "lots_winner_id_users_id_fk" FOREIGN KEY ("winner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lot_images" ADD CONSTRAINT "lot_images_lot_id_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."lots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auction_lots" ADD CONSTRAINT "auction_lots_auction_id_auctions_id_fk" FOREIGN KEY ("auction_id") REFERENCES "public"."auctions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auction_lots" ADD CONSTRAINT "auction_lots_lot_id_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."lots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auctions" ADD CONSTRAINT "auctions_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auctions" ADD CONSTRAINT "auctions_auctioneer_id_users_id_fk" FOREIGN KEY ("auctioneer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bids" ADD CONSTRAINT "bids_auction_id_auctions_id_fk" FOREIGN KEY ("auction_id") REFERENCES "public"."auctions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bids" ADD CONSTRAINT "bids_lot_id_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."lots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bids" ADD CONSTRAINT "bids_bidder_id_users_id_fk" FOREIGN KEY ("bidder_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "max_bids" ADD CONSTRAINT "max_bids_lot_id_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."lots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "max_bids" ADD CONSTRAINT "max_bids_bidder_id_users_id_fk" FOREIGN KEY ("bidder_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_buyer_id_users_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_auction_id_auctions_id_fk" FOREIGN KEY ("auction_id") REFERENCES "public"."auctions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_lot_id_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."lots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_buyer_id_users_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consignments" ADD CONSTRAINT "consignments_seller_id_users_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consignments" ADD CONSTRAINT "consignments_reviewed_by_id_users_id_fk" FOREIGN KEY ("reviewed_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watchlist" ADD CONSTRAINT "watchlist_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watchlist" ADD CONSTRAINT "watchlist_lot_id_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."lots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estate_visit_items" ADD CONSTRAINT "estate_visit_items_visit_id_estate_visits_id_fk" FOREIGN KEY ("visit_id") REFERENCES "public"."estate_visits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auction_reminders" ADD CONSTRAINT "auction_reminders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auction_reminders" ADD CONSTRAINT "auction_reminders_lot_id_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."lots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "users_role_idx" ON "users" USING btree ("role");--> statement-breakpoint
CREATE INDEX "users_email_idx" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "categories_slug_idx" ON "categories" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "categories_sort_order_idx" ON "categories" USING btree ("sort_order");--> statement-breakpoint
CREATE INDEX "subcategories_category_idx" ON "subcategories" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "lots_category_idx" ON "lots" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "lots_status_idx" ON "lots" USING btree ("status");--> statement-breakpoint
CREATE INDEX "lots_seller_idx" ON "lots" USING btree ("seller_id");--> statement-breakpoint
CREATE INDEX "lots_featured_idx" ON "lots" USING btree ("is_featured","status");--> statement-breakpoint
CREATE INDEX "lots_slug_idx" ON "lots" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "lots_current_bid_idx" ON "lots" USING btree ("current_bid_amount");--> statement-breakpoint
CREATE INDEX "lots_sale_type_idx" ON "lots" USING btree ("sale_type","status");--> statement-breakpoint
CREATE INDEX "lots_current_bidder_idx" ON "lots" USING btree ("current_bidder_id");--> statement-breakpoint
CREATE INDEX "lots_winner_idx" ON "lots" USING btree ("winner_id");--> statement-breakpoint
CREATE INDEX "lot_images_lot_idx" ON "lot_images" USING btree ("lot_id","sort_order");--> statement-breakpoint
CREATE INDEX "auction_lots_auction_idx" ON "auction_lots" USING btree ("auction_id","lot_number");--> statement-breakpoint
CREATE INDEX "auction_lots_lot_idx" ON "auction_lots" USING btree ("lot_id");--> statement-breakpoint
CREATE INDEX "auctions_status_idx" ON "auctions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "auctions_slug_idx" ON "auctions" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "auctions_bidding_starts_idx" ON "auctions" USING btree ("bidding_starts_at");--> statement-breakpoint
CREATE INDEX "auctions_featured_idx" ON "auctions" USING btree ("is_featured","status");--> statement-breakpoint
CREATE INDEX "bids_lot_idx" ON "bids" USING btree ("lot_id","amount");--> statement-breakpoint
CREATE INDEX "bids_bidder_idx" ON "bids" USING btree ("bidder_id","created_at");--> statement-breakpoint
CREATE INDEX "bids_auction_idx" ON "bids" USING btree ("auction_id");--> statement-breakpoint
CREATE INDEX "bids_status_idx" ON "bids" USING btree ("bid_status");--> statement-breakpoint
CREATE INDEX "bids_lot_status_idx" ON "bids" USING btree ("lot_id","bid_status");--> statement-breakpoint
CREATE INDEX "max_bids_lot_bidder_idx" ON "max_bids" USING btree ("lot_id","bidder_id");--> statement-breakpoint
CREATE INDEX "max_bids_active_idx" ON "max_bids" USING btree ("lot_id","is_active");--> statement-breakpoint
CREATE INDEX "invoices_buyer_idx" ON "invoices" USING btree ("buyer_id");--> statement-breakpoint
CREATE INDEX "invoices_status_idx" ON "invoices" USING btree ("status");--> statement-breakpoint
CREATE INDEX "invoices_auction_idx" ON "invoices" USING btree ("auction_id");--> statement-breakpoint
CREATE INDEX "invoices_lot_idx" ON "invoices" USING btree ("lot_id");--> statement-breakpoint
CREATE INDEX "invoices_due_date_idx" ON "invoices" USING btree ("due_date");--> statement-breakpoint
CREATE INDEX "payments_invoice_idx" ON "payments" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "payments_buyer_idx" ON "payments" USING btree ("buyer_id");--> statement-breakpoint
CREATE INDEX "payments_status_idx" ON "payments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "consignments_seller_idx" ON "consignments" USING btree ("seller_id");--> statement-breakpoint
CREATE INDEX "consignments_status_idx" ON "consignments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "watchlist_user_idx" ON "watchlist" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "watchlist_unique_idx" ON "watchlist" USING btree ("user_id","lot_id");--> statement-breakpoint
CREATE INDEX "outreach_status_idx" ON "outreach_contacts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "outreach_category_idx" ON "outreach_contacts" USING btree ("category");--> statement-breakpoint
CREATE INDEX "outreach_follow_up_idx" ON "outreach_contacts" USING btree ("next_follow_up_at");--> statement-breakpoint
CREATE INDEX "estate_items_visit_idx" ON "estate_visit_items" USING btree ("visit_id","sort_order");--> statement-breakpoint
CREATE INDEX "estate_items_status_idx" ON "estate_visit_items" USING btree ("status");--> statement-breakpoint
CREATE INDEX "estate_visits_status_idx" ON "estate_visits" USING btree ("status");--> statement-breakpoint
CREATE INDEX "estate_visits_token_idx" ON "estate_visits" USING btree ("report_token");--> statement-breakpoint
CREATE INDEX "estate_visits_created_idx" ON "estate_visits" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "newsletter_email_unique" ON "newsletter_subscribers" USING btree ("email");--> statement-breakpoint
CREATE INDEX "reminder_user_idx" ON "auction_reminders" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reminder_unique_idx" ON "auction_reminders" USING btree ("user_id","lot_id");