import { NextRequest, NextResponse } from 'next/server';
import { isAdminProfile } from '@/lib/auth/admin';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/db';
import { users, auctions, auctionLots } from '@/db/schema';
import { eq, sql } from 'drizzle-orm';
import { createAuctionRoom } from '@/lib/livekit/config';
import { openAuctionLots } from '@/lib/bidding/lifecycle';
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

    // Only auctions awaiting their live session can be started — never
    // restart completed/cancelled/closing auctions or unpublished drafts.
    const STARTABLE_STATUSES = ['scheduled', 'preview', 'open'] as const;
    if (!(STARTABLE_STATUSES as readonly string[]).includes(auction.status)) {
      return NextResponse.json(
        { error: `Cannot start a live session for an auction with status "${auction.status}"` },
        { status: 409 },
      );
    }

    // If the auction hasn't been opened yet (started live directly from
    // scheduled/preview), open its lots now — in_auction status, closingAt, and
    // Redis bid state — so bids are actually accepted. Without this, flipping
    // straight to 'live' leaves every lot unbiddable and the settlement cron
    // (which only opens 'scheduled'/'preview') never runs the open step, so the
    // auction closes having sold nothing.
    if (auction.status === 'scheduled' || auction.status === 'preview') {
      // A timed auction with no biddingEndsAt can't be opened correctly
      // (openAuctionLots refuses it) — don't flip it to 'live' with unbiddable
      // lots; make the auctioneer set an end date first.
      if (auction.type !== 'live' && !auction.biddingEndsAt) {
        return NextResponse.json(
          { error: 'Set a bidding end date before starting this auction.' },
          { status: 409 },
        );
      }
      const opened = await openAuctionLots(auction, new Date());
      if (opened === 0) {
        const [{ count } = { count: 0 }] = await db
          .select({ count: sql<number>`count(*)` })
          .from(auctionLots)
          .where(eq(auctionLots.auctionId, auctionId));
        if (Number(count) > 0) {
          // Had lots but none opened → misconfiguration; don't go live blind.
          return NextResponse.json(
            { error: 'Could not open this auction for bidding. Check its configuration.' },
            { status: 409 },
          );
        }
      }
    }

    const roomName = `auction-${auctionId}`;

    // Create LiveKit room
    await createAuctionRoom(roomName);

    // Update auction to live status
    await db
      .update(auctions)
      .set({
        status: 'live',
        livekitRoomName: roomName,
        updatedAt: new Date(),
      })
      .where(eq(auctions.id, auctionId));

    return NextResponse.json({ roomName, status: 'live' });
  } catch (error) {
    logger.error('Start live auction error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
