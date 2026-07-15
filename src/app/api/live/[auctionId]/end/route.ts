import { NextRequest, NextResponse } from 'next/server';
import { isAdminProfile } from '@/lib/auth/admin';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/db';
import { users, auctions } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { deleteAuctionRoom } from '@/lib/livekit/config';
import { forceCloseAuctionLots } from '@/lib/bidding/lifecycle';
import { logger } from '@/lib/logger';

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
    if (!profile || (!isAdminProfile(profile) && profile.role !== 'auctioneer')) {
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

    // Only a live auction can be ended
    if (auction.status !== 'live') {
      return NextResponse.json(
        { error: `Cannot end an auction with status "${auction.status}" — only live auctions can be ended` },
        { status: 409 },
      );
    }

    // Delete LiveKit room
    if (auction.livekitRoomName) {
      try {
        await deleteAuctionRoom(auction.livekitRoomName);
      } catch {
        // Room may already be gone
      }
    }

    const endedAt = new Date();

    // Force every still-open lot to close right now. The settlement cron will
    // shortly flip this auction 'closing' -> 'closed' (a status that stays
    // biddable for naturally-staggered timed auctions), so unless we collapse
    // each lot's closingAt (DB + Redis) to now, bidding would silently reopen
    // on lots whose staggered close time is still in the future.
    await forceCloseAuctionLots(auctionId, endedAt);

    // Update auction status
    await db
      .update(auctions)
      .set({
        status: 'closing',
        actualEndedAt: endedAt,
        updatedAt: endedAt,
      })
      .where(eq(auctions.id, auctionId));

    return NextResponse.json({ status: 'closing' });
  } catch (error) {
    logger.error('End live auction error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
