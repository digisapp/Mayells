import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/db';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { logger } from '@/lib/logger';

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

    const [profile] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
    const { message, type = 'chat' } = await request.json();

    if (!message || typeof message !== 'string' || message.length > 500) {
      return NextResponse.json({ error: 'Invalid message' }, { status: 400 });
    }

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
        messageType: type, // 'chat', 'reaction', 'bid_notification'
        timestamp: new Date().toISOString(),
      },
    });

    return NextResponse.json({ sent: true });
  } catch (error) {
    logger.error('Chat error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
