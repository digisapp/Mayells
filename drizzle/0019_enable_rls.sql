-- Defense in depth: enable Row Level Security on every application table.
--
-- The app talks to Postgres through Drizzle as the table OWNER (every table
-- was created by `drizzle-kit migrate` under DATABASE_URL's role), and owners
-- bypass RLS unless FORCE ROW LEVEL SECURITY is set — so this changes nothing
-- for the application. What it closes is the Supabase Data API: with RLS on
-- and no policies, the anon/authenticated roles (PostgREST, a future
-- client-side `supabase.from(...)`) can no longer read or write any row.
-- The middleware's role lookup uses the service-role key, which bypasses RLS.
--
-- Preflight: abort loudly if the connecting role is NOT the owner and lacks
-- BYPASSRLS, rather than silently blanking every query in production.
DO $$
DECLARE not_owned int;
BEGIN
  SELECT count(*) INTO not_owned
    FROM pg_tables
   WHERE schemaname = 'public' AND tableowner <> current_user;
  IF not_owned > 0 AND NOT EXISTS (
    SELECT 1 FROM pg_roles WHERE rolname = current_user AND (rolbypassrls OR rolsuper)
  ) THEN
    RAISE EXCEPTION 'enable_rls aborted: % public table(s) are not owned by % and the role lacks BYPASSRLS; the app would lose access', not_owned, current_user;
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "categories" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "subcategories" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "lots" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "lot_images" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "auction_lots" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "auctions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "bids" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "max_bids" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "invoices" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "payments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "payouts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "consignments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "watchlist" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "saved_searches" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "bid_increments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "outreach_contacts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "estate_visit_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "estate_visits" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "newsletter_subscribers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "auction_reminders" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ai_chat_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "inquiries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "emails" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "shipments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "automation_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "seller_prospects" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "upload_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "upload_links" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "webhook_logs" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
-- Lot bid-state broadcasts (topic lot:<lotId>) are receive-only for everyone,
-- signed-in or anonymous: the payload is public price data and clients use it
-- purely as a cue to refetch /api/lots/[lotId]/state. There is no INSERT
-- policy, so only the service-role server path (src/lib/realtime/broadcast.ts)
-- can publish — a viewer can never forge a "new bid" event.
DROP POLICY IF EXISTS "lot state receive broadcasts" ON realtime.messages;
--> statement-breakpoint
CREATE POLICY "lot state receive broadcasts"
ON realtime.messages
FOR SELECT
TO anon, authenticated
USING (
  extension = 'broadcast'
  AND (SELECT realtime.topic()) LIKE 'lot:%'
);
