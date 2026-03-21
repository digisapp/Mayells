export const dynamic = 'force-dynamic';

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { db } from '@/db';
import { auctions, auctionLots, lots } from '@/db/schema';
import { eq, asc } from 'drizzle-orm';
import { Badge } from '@/components/ui/badge';
import { LotGrid } from '@/components/lots/LotGrid';
import { AuctionCountdown } from '@/components/auctions/AuctionCountdown';
import { Calendar, Clock, Gavel, ExternalLink } from 'lucide-react';
import { generateAuctionJsonLd, generateBreadcrumbJsonLd } from '@/lib/seo/structured-data';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://mayellauctions.com';

async function getAuction(auctionId: string) {
  let [auction] = await db.select().from(auctions).where(eq(auctions.slug, auctionId)).limit(1);
  if (!auction) {
    [auction] = await db.select().from(auctions).where(eq(auctions.id, auctionId)).limit(1);
  }
  return auction;
}

export async function generateMetadata({ params }: { params: Promise<{ auctionId: string }> }): Promise<Metadata> {
  const { auctionId } = await params;
  const auction = await getAuction(auctionId);
  if (!auction) return {};

  const title = `${auction.title} | Mayell Auctions`;
  const description = auction.description?.slice(0, 160) || `${auction.title} — ${auction.lotCount} lots. Browse and bid at Mayell.`;

  return {
    title,
    description,
    openGraph: {
      title: auction.title,
      description,
      type: 'website',
      url: `${BASE_URL}/auctions/${auction.slug}`,
      images: auction.coverImageUrl ? [{ url: auction.coverImageUrl, width: 1200, height: 630, alt: auction.title }] : undefined,
    },
    twitter: {
      card: 'summary_large_image',
      title: auction.title,
      description,
      images: auction.coverImageUrl ? [auction.coverImageUrl] : undefined,
    },
  };
}

export default async function AuctionDetailPage({
  params,
}: {
  params: Promise<{ auctionId: string }>;
}) {
  const { auctionId } = await params;

  const auction = await getAuction(auctionId);
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

  // Rich JSON-LD for AI agents + search engines
  const jsonLd = generateAuctionJsonLd({
    id: auction.id,
    title: auction.title,
    description: auction.description,
    slug: auction.slug,
    type: auction.type,
    status: auction.status,
    biddingStartsAt: auction.biddingStartsAt ? new Date(auction.biddingStartsAt) : null,
    biddingEndsAt: auction.biddingEndsAt ? new Date(auction.biddingEndsAt) : null,
    coverImageUrl: auction.coverImageUrl,
    lotCount: auction.lotCount,
  });

  const breadcrumbJsonLd = generateBreadcrumbJsonLd([
    { name: 'Home', url: '/' },
    { name: 'Auctions', url: '/auctions' },
    { name: auction.title, url: `/auctions/${auction.slug || auction.id}` },
  ]);

  return (
    <>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
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

        {/* Bid CTA */}
        {auction.liveauctioneersUrl && (
          <div className="mt-6">
            <a
              href={auction.liveauctioneersUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-champagne text-charcoal hover:bg-champagne/90 rounded-lg px-6 py-3 text-sm font-medium transition-colors"
            >
              Bid on LiveAuctioneers
              <ExternalLink className="h-4 w-4" />
            </a>
          </div>
        )}
      </div>

      {/* Lots grid */}
      <LotGrid lots={lotsData} auctionSlug={auction.slug} />
    </div>
    </>
  );
}
