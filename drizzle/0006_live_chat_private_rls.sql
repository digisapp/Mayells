-- Live-auction chat/bid broadcasts must be a PRIVATE Realtime channel.
--
-- Without this, the `live:<auctionId>` channel is a public broadcast: any
-- visitor holding the public anon key can open a WebSocket to it and send
-- forged messages (fake "Sold for $X" bid notifications, spoofed auctioneer
-- badges). Making the channel private and gating it with RLS means regular
-- users can RECEIVE broadcasts but only the server (service role, which
-- bypasses RLS) can SEND them — see src/app/api/live/[auctionId]/chat/route.ts.
--
-- Supabase Realtime authorization is enforced via RLS on realtime.messages.
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

-- Authenticated users may RECEIVE broadcasts on any live-auction topic.
DROP POLICY IF EXISTS "live auction receive broadcasts" ON realtime.messages;
--> statement-breakpoint
CREATE POLICY "live auction receive broadcasts"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  extension = 'broadcast'
  AND (SELECT realtime.topic()) LIKE 'live:%'
);
--> statement-breakpoint

-- Note: no INSERT policy is granted to authenticated/anon, so regular clients
-- cannot broadcast. The service-role client used by the chat API bypasses RLS
-- and remains the only sender.
