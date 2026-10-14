import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/db';
import { users, auctions } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { isAdminProfile } from '@/lib/auth/admin';
import { UUID_RE } from '@/lib/bidding/lot-resolution';
import { generateToken } from '@/lib/livekit/config';
import { liveDisplayName, liveViewerIdentity } from '@/lib/bidding/bidder-alias';
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
    // A suspended auctioneer loses them, as a suspended admin does.
    const isAuctioneer =
      (profile?.role === 'auctioneer' && profile.accountStatus === 'active') || isAdminProfile(profile);

    // Every participant sees every other's identity and name. Viewers get an
    // opaque per-room identity and a public name (display name, paddle or
    // alias), never their user id or legal name. Staff keep their id so the
    // auctioneer is recognisable in LiveKit's own tools.
    const participantName = isAuctioneer
      ? profile?.displayName?.trim() || 'Mayells'
      : liveDisplayName(auctionId, user.id, profile);
    const token = await generateToken({
      roomName,
      participantName,
      participantIdentity: isAuctioneer ? user.id : liveViewerIdentity(auctionId, user.id),
      isPublisher: isAuctioneer,
      metadata: JSON.stringify({
        role: isAuctioneer ? (profile?.role === 'auctioneer' ? 'auctioneer' : 'admin') : 'bidder',
        displayName: participantName,
      }),
    });

    return NextResponse.json({ token, roomName, isAuctioneer });
  } catch (error) {
    logger.error('Live token error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
