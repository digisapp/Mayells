import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
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

    // Broadcast via Supabase Realtime
    const channel = supabase.channel(`live:${auctionId}`);
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

    return NextResponse.json({ sent: true });
  } catch (error) {
    logger.error('Chat error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
