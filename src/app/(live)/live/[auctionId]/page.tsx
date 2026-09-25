export const dynamic = 'force-dynamic';

import type { Metadata } from 'next';
import { cache } from 'react';
import { notFound } from 'next/navigation';
import { db } from '@/db';
import { auctions, auctionLots, lots } from '@/db/schema';
import { eq, asc } from 'drizzle-orm';
import { createClient } from '@/lib/supabase/server';
import { getMinNextBid } from '@/lib/bidding/bid-increments';
import { UUID_RE } from '@/lib/bidding/lot-resolution';
import { LiveAuctionViewer } from '@/components/live/LiveAuctionViewer';
import { lotPhase, type LiveLot } from '@/components/live/live-lots';

type Params = Promise<{ auctionId: string }>;

// Shared by generateMetadata and the page: one query per request.
const getLiveAuction = cache(async (auctionId: string) => {
  if (!UUID_RE.test(auctionId)) return null;
  const [auction] = await db
    .select({
      id: auctions.id,
      title: auctions.title,
      slug: auctions.slug,
      status: auctions.status,
      biddingEndsAt: auctions.biddingEndsAt,
      buyerPremiumPercent: auctions.buyerPremiumPercent,
    })
    .from(auctions)
    .where(eq(auctions.id, auctionId))
    .limit(1);
  return auction?.status === 'live' ? auction : null;
});

/**
 * The page re-renders on every soft refresh (every 5–20s per viewer), so read
 * the viewer from locally-verified JWT claims rather than a Supabase Auth
 * round trip — the same trade-off the lot-state endpoint makes.
 */
async function getViewerId(): Promise<string | null> {
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getClaims();
    return data?.claims?.sub ?? null;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const auction = await getLiveAuction((await params).auctionId);
  return { title: auction ? `Live: ${auction.title}` : 'Live auction' };
}

export default async function LiveAuctionPage({ params }: { params: Params }) {
  const { auctionId } = await params;
  if (!UUID_RE.test(auctionId)) notFound();

  const [auction, viewerId] = await Promise.all([getLiveAuction(auctionId), getViewerId()]);
  if (!auction) notFound();

  const rows = await db
    .select({
      lotNumber: auctionLots.lotNumber,
      closingAt: auctionLots.closingAt,
      id: lots.id,
      slug: lots.slug,
      title: lots.title,
      primaryImageUrl: lots.primaryImageUrl,
      status: lots.status,
      startingBid: lots.startingBid,
      currentBidAmount: lots.currentBidAmount,
      currentBidderId: lots.currentBidderId,
      bidCount: lots.bidCount,
      estimateLow: lots.estimateLow,
      estimateHigh: lots.estimateHigh,
    })
    .from(auctionLots)
    .innerJoin(lots, eq(auctionLots.lotId, lots.id))
    .where(eq(auctionLots.auctionId, auctionId))
    .orderBy(asc(auctionLots.lotNumber));

  // A server component renders once per request; the clock read is intended.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  // Bidder identities never reach the client; only "is it you" does.
  const liveLots: LiveLot[] = rows.map((row) => {
    const closingAt = row.closingAt ?? auction.biddingEndsAt;
    return {
      id: row.id,
      slug: row.slug,
      lotNumber: row.lotNumber,
      title: row.title,
      imageUrl: row.primaryImageUrl,
      currentBidAmount: row.currentBidAmount,
      bidCount: row.bidCount,
      estimateLow: row.estimateLow,
      estimateHigh: row.estimateHigh,
      minNextBid: getMinNextBid(row.currentBidAmount, row.startingBid ?? 0),
      phase: lotPhase(row.status, closingAt, now),
      closingAt: closingAt ? closingAt.toISOString() : null,
      isHighBidder: !!viewerId && row.currentBidderId === viewerId,
    };
  });

  return (
    <LiveAuctionViewer
      auction={{ id: auction.id, title: auction.title, slug: auction.slug, buyerPremiumPercent: auction.buyerPremiumPercent }}
      lots={liveLots}
      viewer={{ signedIn: !!viewerId }}
    />
  );
}
