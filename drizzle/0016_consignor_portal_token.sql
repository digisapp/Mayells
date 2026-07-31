ALTER TABLE "users" ADD COLUMN "portal_token" uuid DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_portal_token_unique" UNIQUE("portal_token");