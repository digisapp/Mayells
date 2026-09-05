import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/db';
import { users, auctions } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { isAdminProfile } from '@/lib/auth/admin';
import { UUID_RE } from '@/lib/bidding/lot-resolution';
import { generateToken } from '@/lib/livekit/config';
import { logger } from '@/lib/logger';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ auctionId: string }> },
) {
  try {
    const { auctionId } = await params;
    if (!UUID_RE.test(auctionId)) {
      return NextResponse.json({ error: 'Auction not found' }, { status: 404 });
    }
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const [auction] = await db
      .select()
      .from(auctions)
      .where(eq(auctions.id, auctionId))
      .limit(1);

    if (!auction) {
      return NextResponse.json({ error: 'Auction not found' }, { status: 404 });
    }

    if (auction.status !== 'live') {
      return NextResponse.json({ error: 'Auction is not live' }, { status: 400 });
    }

    const roomName = auction.livekitRoomName || `auction-${auctionId}`;

    const [profile] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
    // Publisher rights for the auctioneer role and for any admin (role OR the
    // is_admin flag — isAdminProfile is the single source of that decision).
    const isAuctioneer = profile?.role === 'auctioneer' || isAdminProfile(profile);

    const token = await generateToken({
      roomName,
      participantName: profile?.displayName || profile?.fullName || 'Bidder',
      participantIdentity: user.id,
      isPublisher: isAuctioneer,
      metadata: JSON.stringify({
        role: profile?.role,
        displayName: profile?.displayName || profile?.fullName,
      }),
    });

    return NextResponse.json({ token, roomName, isAuctioneer });
  } catch (error) {
    logger.error('Live token error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
