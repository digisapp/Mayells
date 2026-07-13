import { NextRequest, NextResponse } from 'next/server';
import { isAdminProfile } from '@/lib/auth/admin';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { db } from '@/db';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { rateLimit } from '@/lib/rate-limit';

const chatSchema = z.object({
  message: z.string().min(1).max(500),
  type: z.enum(['chat', 'reaction', 'bid_notification']).optional().default('chat'),
});

/**
 * Chat messages are broadcast via Supabase Realtime, not stored permanently.
 * This endpoint handles sending a chat message to the auction channel.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ auctionId: string }> },
) {
  try {
    const { auctionId } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { success } = await rateLimit(`live:chat:${user.id}`, { maxRequests: 60, windowSeconds: 60 });
    if (!success) {
      return NextResponse.json({ error: 'Too many messages — slow down' }, { status: 429 });
    }

    const parsed = chatSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }
    const { message, type } = parsed.data;

    const [profile] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);

    // Only staff may broadcast system message types — anyone could otherwise
    // spoof bid_notification events to the live room. Plain chat and emoji
    // reactions remain open to all authenticated users.
    if (type !== 'chat' && type !== 'reaction' && !isAdminProfile(profile) && profile?.role !== 'auctioneer') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Broadcast on the PRIVATE auction channel using the service-role client.
    // The channel's RLS policy (see migration 0006) lets authenticated users
    // only receive — not send — so regular clients can no longer connect
    // directly and forge auctioneer/bid-notification messages. Only this
    // server path, holding the service role, can publish.
    const admin = createAdminClient();
    const channel = admin.channel(`live:${auctionId}`, {
      config: { private: true },
    });
    await channel.send({
      type: 'broadcast',
      event: 'chat',
      payload: {
        userId: user.id,
        displayName: profile?.displayName || profile?.fullName || 'Anonymous',
        role: profile?.role,
        message,
        messageType: type,
        timestamp: new Date().toISOString(),
      },
    });
    await admin.removeChannel(channel);

    return NextResponse.json({ sent: true });
  } catch (error) {
    logger.error('Chat error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
