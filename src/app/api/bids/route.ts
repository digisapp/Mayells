import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/db';
import { bids, lots, auctions } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const userBids = await db
      .select({
        bid: bids,
        lot: {
          id: lots.id,
          title: lots.title,
          lotNumber: lots.lotNumber,
          primaryImageUrl: lots.primaryImageUrl,
          currentBidAmount: lots.currentBidAmount,
          currentBidderId: lots.currentBidderId,
          bidCount: lots.bidCount,
          estimateLow: lots.estimateLow,
          estimateHigh: lots.estimateHigh,
          status: lots.status,
          slug: lots.slug,
        },
        auction: {
          id: auctions.id,
          title: auctions.title,
          slug: auctions.slug,
          biddingEndsAt: auctions.biddingEndsAt,
          status: auctions.status,
        },
      })
      .from(bids)
      .innerJoin(lots, eq(bids.lotId, lots.id))
      .innerJoin(auctions, eq(bids.auctionId, auctions.id))
      .where(eq(bids.bidderId, user.id))
      .orderBy(desc(bids.createdAt))
      .limit(100);

    return NextResponse.json({ data: userBids });
  } catch (error) {
    console.error('Bids error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
