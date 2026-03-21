CREATE TYPE "public"."email_direction" AS ENUM('inbound', 'outbound');--> statement-breakpoint
CREATE TYPE "public"."email_status" AS ENUM('received', 'read', 'replied', 'sent', 'delivered', 'bounced');--> statement-breakpoint
CREATE TYPE "public"."shipping_carrier" AS ENUM('fedex', 'ups', 'usps', 'dhl', 'arta', 'other');--> statement-breakpoint
CREATE TYPE "public"."shipment_status" AS ENUM('pending', 'label_created', 'pickup_scheduled', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'exception', 'returned');--> statement-breakpoint
CREATE TYPE "public"."shipping_method" AS ENUM('standard', 'pickup', 'white_glove');--> statement-breakpoint
CREATE TABLE "emails" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"resend_id" varchar(255),
	"direction" "email_direction" NOT NULL,
	"status" "email_status" DEFAULT 'received' NOT NULL,
	"from_email" varchar(320) NOT NULL,
	"from_name" varchar(255),
	"to_email" varchar(320) NOT NULL,
	"to_name" varchar(255),
	"subject" varchar(1000),
	"body_html" text,
	"body_text" text,
	"message_id" varchar(500),
	"in_reply_to_message_id" varchar(500),
	"in_reply_to_id" uuid,
	"thread_id" uuid,
	"user_id" uuid,
	"is_spam" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shipments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"lot_id" uuid NOT NULL,
	"seller_id" uuid NOT NULL,
	"buyer_id" uuid NOT NULL,
	"method" "shipping_method" DEFAULT 'standard' NOT NULL,
	"carrier" "shipping_carrier",
	"status" "shipment_status" DEFAULT 'pending' NOT NULL,
	"label_url" text,
	"tracking_number" text,
	"tracking_url" text,
	"external_shipment_id" text,
	"external_transaction_id" text,
	"external_rate_id" text,
	"shipping_cost" integer DEFAULT 0 NOT NULL,
	"insurance_cost" integer DEFAULT 0 NOT NULL,
	"insurance_value" integer DEFAULT 0,
	"pickup_date" timestamp,
	"pickup_window_start" text,
	"pickup_window_end" text,
	"from_name" text NOT NULL,
	"from_phone" text,
	"from_email" text,
	"from_street" text NOT NULL,
	"from_street_2" text,
	"from_city" text NOT NULL,
	"from_state" text NOT NULL,
	"from_zip" text NOT NULL,
	"from_country" text DEFAULT 'US' NOT NULL,
	"to_name" text NOT NULL,
	"to_phone" text,
	"to_email" text,
	"to_street" text NOT NULL,
	"to_street_2" text,
	"to_city" text NOT NULL,
	"to_state" text NOT NULL,
	"to_zip" text NOT NULL,
	"to_country" text DEFAULT 'US' NOT NULL,
	"weight_lbs" integer,
	"weight_oz" integer,
	"length_in" integer,
	"width_in" integer,
	"height_in" integer,
	"requires_signature" boolean DEFAULT true NOT NULL,
	"requires_insurance" boolean DEFAULT true NOT NULL,
	"is_fragile" boolean DEFAULT false NOT NULL,
	"label_created_at" timestamp,
	"shipped_at" timestamp,
	"delivered_at" timestamp,
	"estimated_delivery" timestamp,
	"seller_notes" text,
	"buyer_notes" text,
	"internal_notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "automation_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"auto_approve_consignments" boolean DEFAULT false NOT NULL,
	"auto_approve_max_value" integer DEFAULT 500000,
	"auto_approve_min_confidence" integer DEFAULT 70,
	"auto_approve_require_address" boolean DEFAULT true NOT NULL,
	"ai_auto_catalog" boolean DEFAULT true NOT NULL,
	"ai_auto_appraise" boolean DEFAULT true NOT NULL,
	"require_catalog_review" boolean DEFAULT false NOT NULL,
	"auto_schedule_auctions" boolean DEFAULT false NOT NULL,
	"auto_schedule_min_lots" integer DEFAULT 20,
	"auto_schedule_day_of_week" integer DEFAULT 2,
	"auto_schedule_hour" integer DEFAULT 10,
	"auto_invoice_on_close" boolean DEFAULT true NOT NULL,
	"invoice_due_days" integer DEFAULT 7,
	"auto_create_shipment" boolean DEFAULT true NOT NULL,
	"auto_generate_label" boolean DEFAULT false NOT NULL,
	"default_carrier" text DEFAULT 'fedex',
	"require_signature" boolean DEFAULT true NOT NULL,
	"require_insurance" boolean DEFAULT true NOT NULL,
	"white_glove_threshold" integer DEFAULT 100000,
	"default_commission_percent" integer DEFAULT 25,
	"high_value_commission_percent" integer DEFAULT 15,
	"high_value_threshold" integer DEFAULT 1000000,
	"notify_seller_on_approval" boolean DEFAULT true NOT NULL,
	"notify_seller_on_sale" boolean DEFAULT true NOT NULL,
	"notify_seller_on_shipment" boolean DEFAULT true NOT NULL,
	"notify_buyer_on_shipment" boolean DEFAULT true NOT NULL,
	"send_daily_digest" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp DEFAULT now(),
	"updated_by_id" uuid
);
--> statement-breakpoint
ALTER TABLE "consignments" ADD COLUMN "pickup_street" text;--> statement-breakpoint
ALTER TABLE "consignments" ADD COLUMN "pickup_street_2" text;--> statement-breakpoint
ALTER TABLE "consignments" ADD COLUMN "pickup_city" text;--> statement-breakpoint
ALTER TABLE "consignments" ADD COLUMN "pickup_state" text;--> statement-breakpoint
ALTER TABLE "consignments" ADD COLUMN "pickup_zip" text;--> statement-breakpoint
ALTER TABLE "consignments" ADD COLUMN "pickup_country" text DEFAULT 'US';--> statement-breakpoint
ALTER TABLE "consignments" ADD COLUMN "pickup_phone" text;--> statement-breakpoint
ALTER TABLE "consignments" ADD COLUMN "seller_ships_item" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "consignments" ADD COLUMN "request_pickup" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "consignments" ADD COLUMN "requires_white_glove" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "consignments" ADD COLUMN "weight_lbs" integer;--> statement-breakpoint
ALTER TABLE "consignments" ADD COLUMN "length_in" integer;--> statement-breakpoint
ALTER TABLE "consignments" ADD COLUMN "width_in" integer;--> statement-breakpoint
ALTER TABLE "consignments" ADD COLUMN "height_in" integer;--> statement-breakpoint
ALTER TABLE "consignments" ADD COLUMN "is_fragile" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "consignments" ADD COLUMN "ai_title" text;--> statement-breakpoint
ALTER TABLE "consignments" ADD COLUMN "ai_description" text;--> statement-breakpoint
ALTER TABLE "consignments" ADD COLUMN "ai_category" text;--> statement-breakpoint
ALTER TABLE "consignments" ADD COLUMN "ai_estimate_low" integer;--> statement-breakpoint
ALTER TABLE "consignments" ADD COLUMN "ai_estimate_high" integer;--> statement-breakpoint
ALTER TABLE "consignments" ADD COLUMN "ai_confidence" numeric;--> statement-breakpoint
ALTER TABLE "consignments" ADD COLUMN "ai_condition" text;--> statement-breakpoint
ALTER TABLE "consignments" ADD COLUMN "ai_tags" text[];--> statement-breakpoint
ALTER TABLE "consignments" ADD COLUMN "ai_artist" text;--> statement-breakpoint
ALTER TABLE "consignments" ADD COLUMN "ai_period" text;--> statement-breakpoint
ALTER TABLE "consignments" ADD COLUMN "ai_medium" text;--> statement-breakpoint
ALTER TABLE "consignments" ADD COLUMN "ai_origin" text;--> statement-breakpoint
ALTER TABLE "consignments" ADD COLUMN "ai_processed_at" timestamp;--> statement-breakpoint
ALTER TABLE "consignments" ADD COLUMN "agreement_signed_at" timestamp;--> statement-breakpoint
ALTER TABLE "consignments" ADD COLUMN "agreement_ip" text;--> statement-breakpoint
ALTER TABLE "consignments" ADD COLUMN "auto_approved" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "emails" ADD CONSTRAINT "emails_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_lot_id_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."lots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_seller_id_users_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_buyer_id_users_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "emails_direction_idx" ON "emails" USING btree ("direction");--> statement-breakpoint
CREATE INDEX "emails_status_idx" ON "emails" USING btree ("status");--> statement-breakpoint
CREATE INDEX "emails_from_email_idx" ON "emails" USING btree ("from_email");--> statement-breakpoint
CREATE INDEX "emails_to_email_idx" ON "emails" USING btree ("to_email");--> statement-breakpoint
CREATE INDEX "emails_thread_id_idx" ON "emails" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX "emails_message_id_idx" ON "emails" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "emails_created_at_idx" ON "emails" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "emails_user_id_idx" ON "emails" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "shipments_invoice_idx" ON "shipments" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "shipments_lot_idx" ON "shipments" USING btree ("lot_id");--> statement-breakpoint
CREATE INDEX "shipments_seller_idx" ON "shipments" USING btree ("seller_id");--> statement-breakpoint
CREATE INDEX "shipments_buyer_idx" ON "shipments" USING btree ("buyer_id");--> statement-breakpoint
CREATE INDEX "shipments_status_idx" ON "shipments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "shipments_tracking_idx" ON "shipments" USING btree ("tracking_number");