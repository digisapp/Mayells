ALTER TABLE "invoices" ADD COLUMN "reminder_sent_at" timestamp;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "refunded_amount" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "disputed_at" timestamp;