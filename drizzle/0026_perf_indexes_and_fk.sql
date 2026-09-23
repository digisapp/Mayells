DROP INDEX "emails_archived_at_idx";--> statement-breakpoint
-- Clear visits that point at deleted prospects, or the FK below cannot be added.
UPDATE "estate_visits" ev SET "prospect_id" = NULL WHERE "prospect_id" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "seller_prospects" sp WHERE sp."id" = ev."prospect_id");--> statement-breakpoint
ALTER TABLE "estate_visits" ADD CONSTRAINT "estate_visits_prospect_id_seller_prospects_id_fk" FOREIGN KEY ("prospect_id") REFERENCES "public"."seller_prospects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "users_email_lower_idx" ON "users" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "invoices_stripe_pi_idx" ON "invoices" USING btree ("stripe_payment_intent_id") WHERE stripe_payment_intent_id is not null;--> statement-breakpoint
CREATE INDEX "payments_stripe_pi_idx" ON "payments" USING btree ("stripe_payment_intent_id") WHERE stripe_payment_intent_id is not null;--> statement-breakpoint
CREATE INDEX "estate_visits_prospect_idx" ON "estate_visits" USING btree ("prospect_id");--> statement-breakpoint
CREATE INDEX "emails_resend_id_idx" ON "emails" USING btree ("resend_id") WHERE resend_id is not null;--> statement-breakpoint
CREATE INDEX "emails_live_created_idx" ON "emails" USING btree ("created_at" DESC NULLS LAST) WHERE archived_at is null;--> statement-breakpoint
CREATE INDEX "emails_from_email_lower_idx" ON "emails" USING btree (lower("from_email"));--> statement-breakpoint
CREATE INDEX "emails_to_email_lower_idx" ON "emails" USING btree (lower("to_email"));--> statement-breakpoint
CREATE INDEX "seller_prospects_email_lower_idx" ON "seller_prospects" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "emails_archived_at_idx" ON "emails" USING btree ("archived_at") WHERE archived_at is not null;