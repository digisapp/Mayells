import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/db';
import { users, auctions } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { deleteAuctionRoom } from '@/lib/livekit/config';

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
    if (!profile || (profile.role !== 'admin' && profile.role !== 'auctioneer')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const [auction] = await db
      .select()
      .from(auctions)
      .where(eq(auctions.id, auctionId))
      .limit(1);

    if (!auction) {
      return NextResponse.json({ error: 'Auction not found' }, { status: 404 });
    }

    // Delete LiveKit room
    if (auction.livekitRoomName) {
      try {
        await deleteAuctionRoom(auction.livekitRoomName);
      } catch {
        // Room may already be gone
      }
    }

    // Update auction status
    await db
      .update(auctions)
      .set({
        status: 'closing',
        actualEndedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(auctions.id, auctionId));

    return NextResponse.json({ status: 'closing' });
  } catch (error) {
    console.error('End live auction error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
