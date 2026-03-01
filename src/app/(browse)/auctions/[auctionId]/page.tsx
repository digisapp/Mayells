export const dynamic = 'force-dynamic';

import { notFound } from 'next/navigation';
import { db } from '@/db';
import { auctions, auctionLots, lots } from '@/db/schema';
import { eq, asc } from 'drizzle-orm';
import { Badge } from '@/components/ui/badge';
import { LotGrid } from '@/components/lots/LotGrid';
import { AuctionCountdown } from '@/components/auctions/AuctionCountdown';
import { Calendar, Clock, Gavel } from 'lucide-react';

export default async function AuctionDetailPage({
  params,
}: {
  params: Promise<{ auctionId: string }>;
}) {
  const { auctionId } = await params;

  // Find by slug or ID
  let [auction] = await db.select().from(auctions).where(eq(auctions.slug, auctionId)).limit(1);
  if (!auction) {
    [auction] = await db.select().from(auctions).where(eq(auctions.id, auctionId)).limit(1);
  }
  if (!auction) notFound();

  const auctionLotsResult = await db
    .select({ lot: lots, auctionLot: auctionLots })
    .from(auctionLots)
    .innerJoin(lots, eq(auctionLots.lotId, lots.id))
    .where(eq(auctionLots.auctionId, auction.id))
    .orderBy(asc(auctionLots.lotNumber));

  const lotsData = auctionLotsResult.map(({ lot, auctionLot }) => ({
    ...lot,
    lotNumber: auctionLot.lotNumber,
  }));

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      {/* Header */}
      <div className="mb-10">
        <div className="flex items-center gap-3 mb-4">
          <Badge variant={auction.status === 'open' ? 'default' : 'secondary'}>
            {auction.status === 'open' ? 'Bidding Open' : auction.status}
          </Badge>
          {auction.saleNumber && (
            <span className="text-sm text-muted-foreground">Sale {auction.saleNumber}</span>
          )}
        </div>
        <h1 className="font-display text-display-lg">{auction.title}</h1>
        {auction.subtitle && (
          <p className="text-xl text-muted-foreground mt-2">{auction.subtitle}</p>
        )}
        {auction.description && (
          <p className="text-muted-foreground mt-4 max-w-2xl">{auction.description}</p>
        )}

        <div className="flex flex-wrap items-center gap-6 mt-6 text-sm text-muted-foreground">
          {auction.biddingStartsAt && (
            <span className="flex items-center gap-1.5">
              <Calendar className="h-4 w-4" />
              {new Intl.DateTimeFormat('en-US', { dateStyle: 'long' }).format(new Date(auction.biddingStartsAt))}
            </span>
          )}
          <span className="flex items-center gap-1.5">
            <Gavel className="h-4 w-4" />
            {auction.lotCount} lots
          </span>
          {auction.biddingEndsAt && auction.status === 'open' && (
            <span className="flex items-center gap-1.5">
              <Clock className="h-4 w-4" />
              Closes in: <AuctionCountdown endsAt={new Date(auction.biddingEndsAt)} className="font-medium text-foreground" />
            </span>
          )}
        </div>
      </div>

      {/* Lots grid */}
      <LotGrid lots={lotsData} auctionSlug={auction.slug} />
    </div>
  );
}
