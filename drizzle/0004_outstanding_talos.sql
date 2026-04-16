CREATE TABLE "webhook_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" varchar(20) NOT NULL,
	"event_type" varchar(100) NOT NULL,
	"event_id" varchar(255),
	"status" varchar(20) DEFAULT 'success' NOT NULL,
	"error_message" text,
	"processing_ms" integer,
	"payload" jsonb,
	"related_type" varchar(50),
	"related_id" varchar(255),
	"replay_count" integer DEFAULT 0 NOT NULL,
	"last_replayed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "emails" ADD COLUMN "ai_draft_html" text;--> statement-breakpoint
ALTER TABLE "emails" ADD COLUMN "ai_draft_text" text;--> statement-breakpoint
ALTER TABLE "emails" ADD COLUMN "ai_drafted_at" timestamp;--> statement-breakpoint
ALTER TABLE "emails" ADD COLUMN "ai_auto_sent" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "emails" ADD COLUMN "ai_category" varchar(100);--> statement-breakpoint
ALTER TABLE "emails" ADD COLUMN "ai_confidence" real;--> statement-breakpoint
ALTER TABLE "emails" ADD COLUMN "ai_summary" text;--> statement-breakpoint
ALTER TABLE "emails" ADD COLUMN "read_at" timestamp;--> statement-breakpoint
ALTER TABLE "emails" ADD COLUMN "replied_at" timestamp;--> statement-breakpoint
ALTER TABLE "automation_settings" ADD COLUMN "ai_email_auto_reply" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "automation_settings" ADD COLUMN "auto_follow_up_prospects" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "automation_settings" ADD COLUMN "follow_up_delay_hours" integer DEFAULT 48;--> statement-breakpoint
ALTER TABLE "automation_settings" ADD COLUMN "follow_up_upload_reminder_hours" integer DEFAULT 72;--> statement-breakpoint
CREATE INDEX "whl_provider_idx" ON "webhook_logs" USING btree ("provider");--> statement-breakpoint
CREATE INDEX "whl_status_idx" ON "webhook_logs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "whl_event_type_idx" ON "webhook_logs" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "whl_created_at_idx" ON "webhook_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "whl_event_id_idx" ON "webhook_logs" USING btree ("event_id");