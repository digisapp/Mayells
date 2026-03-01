export const dynamic = 'force-dynamic';

import { notFound } from 'next/navigation';
import { db } from '@/db';
import { auctions, auctionLots, lots } from '@/db/schema';
import { eq, asc } from 'drizzle-orm';
import { LiveAuctionViewer } from '@/components/live/LiveAuctionViewer';

export default async function LiveAuctionPage({
  params,
}: {
  params: Promise<{ auctionId: string }>;
}) {
  const { auctionId } = await params;

  const [auction] = await db
    .select()
    .from(auctions)
    .where(eq(auctions.id, auctionId))
    .limit(1);

  if (!auction || auction.status !== 'live') {
    notFound();
  }

  const aLots = await db
    .select({
      lotNumber: auctionLots.lotNumber,
      lot: {
        id: lots.id,
        title: lots.title,
        primaryImageUrl: lots.primaryImageUrl,
        currentBidAmount: lots.currentBidAmount,
        bidCount: lots.bidCount,
        estimateLow: lots.estimateLow,
        estimateHigh: lots.estimateHigh,
      },
    })
    .from(auctionLots)
    .innerJoin(lots, eq(auctionLots.lotId, lots.id))
    .where(eq(auctionLots.auctionId, auctionId))
    .orderBy(asc(auctionLots.lotNumber));

  return (
    <LiveAuctionViewer
      auction={{
        id: auction.id,
        title: auction.title,
        slug: auction.slug,
      }}
      lots={aLots}
    />
  );
}
