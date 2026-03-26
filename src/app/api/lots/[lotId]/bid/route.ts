import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { db } from '@/db';
import { lots, auctionLots, auctions, users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { placeBid } from '@/lib/bidding/bid-engine';
import { bidSchema } from '@/lib/validation/schemas';
import { rateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { sendOutbidNotification } from '@/lib/email/notifications';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ lotId: string }> },
) {
  try {
    const { lotId } = await params;

    // Auth check
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Rate limit: 10 bids per minute per user per lot
    const rateLimitResult = await rateLimit(`bid:${user.id}:${lotId}`, {
      maxRequests: 10,
      windowSeconds: 60,
    });
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: 'Too many bids. Please wait a moment.' },
        { status: 429 },
      );
    }

    // Parse & validate
    const body = await req.json();
    const parsed = bidSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    // Get lot and auction info
    const [lot] = await db.select().from(lots).where(eq(lots.id, lotId)).limit(1);
    if (!lot) {
      return NextResponse.json({ error: 'Lot not found' }, { status: 404 });
    }

    if (lot.status !== 'in_auction') {
      return NextResponse.json({ error: 'This lot is not currently accepting bids' }, { status: 400 });
    }

    // Get auction for this lot
    const [auctionLot] = await db
      .select({ auctionId: auctionLots.auctionId })
      .from(auctionLots)
      .where(eq(auctionLots.lotId, lotId))
      .limit(1);

    if (!auctionLot) {
      return NextResponse.json({ error: 'Lot not assigned to an auction' }, { status: 400 });
    }

    const [auction] = await db
      .select()
      .from(auctions)
      .where(eq(auctions.id, auctionLot.auctionId))
      .limit(1);

    if (!auction || (auction.status !== 'open' && auction.status !== 'live')) {
      return NextResponse.json({ error: 'Auction is not accepting bids' }, { status: 400 });
    }

    // Place the bid
    const result = await placeBid({
      lotId,
      auctionId: auction.id,
      bidderId: user.id,
      amount: parsed.data.amount,
      maxBidAmount: parsed.data.maxBidAmount,
      idempotencyKey: parsed.data.idempotencyKey,
      ipAddress: req.headers.get('x-forwarded-for') || 'unknown',
      userAgent: req.headers.get('user-agent') || 'unknown',
      antiSnipeSettings: {
        antiSnipeEnabled: auction.antiSnipeEnabled,
        antiSnipeMinutes: auction.antiSnipeMinutes,
        antiSnipeWindowMinutes: auction.antiSnipeWindowMinutes,
      },
    });

    if (!result.success) {
      const errorMessages: Record<string, string> = {
        AUCTION_CLOSED: 'This auction has ended',
        ALREADY_HIGH_BIDDER: 'You are already the high bidder',
        BID_TOO_LOW: 'Your bid does not meet the minimum increment',
      };
      return NextResponse.json(
        { error: errorMessages[result.error!] || result.error },
        { status: 400 },
      );
    }

    // Broadcast via Supabase Realtime
    const adminSupabase = createAdminClient();
    const channel = adminSupabase.channel(`auction:${auction.id}:lot:${lotId}`);
    await channel.send({
      type: 'broadcast',
      event: 'new_bid',
      payload: {
        lotId,
        amount: parsed.data.amount,
        bidCount: (lot.bidCount || 0) + 1,
        extended: result.extended,
        newCloseTime: result.newCloseTime,
      },
    });

    // Notify outbid user via realtime + email
    if (result.previousBidderId) {
      const outbidChannel = adminSupabase.channel(`user:${result.previousBidderId}`);
      await outbidChannel.send({
        type: 'broadcast',
        event: 'outbid',
        payload: {
          lotId,
          lotTitle: lot.title,
          newAmount: parsed.data.amount,
        },
      });

      // Send outbid email (non-blocking)
      const [outbidUser] = await db
        .select({ email: users.email })
        .from(users)
        .where(eq(users.id, result.previousBidderId))
        .limit(1);
      if (outbidUser?.email) {
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://mayells.com';
        sendOutbidNotification({
          email: outbidUser.email,
          lotTitle: lot.title,
          lotUrl: `${baseUrl}/auctions/${auction.id}/lots/${lotId}`,
          currentBid: parsed.data.amount,
          yourBid: lot.currentBidAmount || 0,
        }).catch((err) => logger.error('Failed to send outbid email', err));
      }
    }

    return NextResponse.json({
      success: true,
      bid: result.bid,
      extended: result.extended,
    });
  } catch (error) {
    logger.error('Place bid error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
