// ISR per auction path; new bids and admin mutations revalidate on demand so
// current-bid figures on the catalog stay near-live without per-request renders.
export const revalidate = 60;

import { cache } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { db } from '@/db';
import { auctions, auctionLots, lots } from '@/db/schema';
import type { Lot } from '@/db/schema/lots';
import { eq, asc, or, and, inArray } from 'drizzle-orm';
import { PUBLIC_CATALOGUE_LOT_STATUSES, publicLotColumns } from '@/lib/lots/visibility';
import { Badge } from '@/components/ui/badge';
import { LotGrid } from '@/components/lots/LotGrid';
import { AuctionCountdown } from '@/components/auctions/AuctionCountdown';
import { Calendar, Clock, Gavel, ExternalLink } from 'lucide-react';
import { generateAuctionJsonLd, generateBreadcrumbJsonLd, serializeJsonLd } from '@/lib/seo/structured-data';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://mayells.com';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Reader-facing names for the sale status (the raw enum read "scheduled").
const STATUS_LABELS: Record<string, string> = {
  scheduled: 'Upcoming',
  preview: 'Preview',
  open: 'Bidding Open',
  live: 'Live Now',
  closing: 'Closing',
  closed: 'Closed',
  completed: 'Closed',
};

// cache(): generateMetadata and the page body share one lookup per request.
// Single query instead of a slug-then-id serial fallback (the id comparison is
// only attempted for UUID-shaped params — a non-UUID string would make the
// uuid-column cast throw).
const getAuction = cache(async (auctionId: string) => {
  const [auction] = await db
    .select()
    .from(auctions)
    .where(
      UUID_RE.test(auctionId)
        ? or(eq(auctions.id, auctionId), eq(auctions.slug, auctionId))
        : eq(auctions.slug, auctionId),
    )
    .limit(1);
  return auction;
});

export async function generateMetadata({ params }: { params: Promise<{ auctionId: string }> }): Promise<Metadata> {
  const { auctionId } = await params;
  const auction = await getAuction(auctionId);
  if (!auction) return {};

  const title = `${auction.title} | Mayells`;
  const description = auction.description?.slice(0, 160) || `${auction.title} — ${auction.lotCount} lots. Browse and bid at Mayells.`;

  const canonicalUrl = `${BASE_URL}/auctions/${auction.slug || auction.id}`;

  return {
    title,
    description,
    alternates: { canonical: canonicalUrl },
    openGraph: {
      title: auction.title,
      description,
      type: 'website',
      url: canonicalUrl,
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

  // NOTE: no server-side track() here — on an ISR page it would fire once per
  // revalidation, not per view, and report misleading counts. Vercel Analytics'
  // client script already records these page views.

  // Only catalogue-visible lots (approved / for_sale / in_auction / sold), and
  // only their public columns: a draft or withdrawn placement, and every lot's
  // reserve, seller and bidder ids, must never reach the RSC payload.
  const auctionLotsResult = await db
    .select({ lot: publicLotColumns, auctionLot: auctionLots })
    .from(auctionLots)
    .innerJoin(lots, eq(auctionLots.lotId, lots.id))
    .where(and(
      eq(auctionLots.auctionId, auction.id),
      inArray(lots.status, [...PUBLIC_CATALOGUE_LOT_STATUSES]),
    ))
    .orderBy(asc(auctionLots.lotNumber));

  // LotGrid is typed on the full Lot row but LotCard only reads public
  // fields; the projection above is the public subset of that row.
  const lotsData = auctionLotsResult.map(({ lot, auctionLot }) => ({
    ...lot,
    lotNumber: auctionLot.lotNumber,
  })) as Lot[];

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
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} />
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbJsonLd) }} />
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-12 sm:py-12">
      {/* Header */}
      <div className="mb-8 sm:mb-10">
        <div className="flex items-center gap-3 mb-4">
          <Badge variant={auction.status === 'open' || auction.status === 'live' ? 'default' : 'secondary'}>
            {STATUS_LABELS[auction.status] ?? auction.status}
          </Badge>
          {auction.saleNumber && (
            <span className="text-sm text-muted-foreground">Sale {auction.saleNumber}</span>
          )}
        </div>
        <h1 className="font-display text-display-lg">{auction.title}</h1>
        {auction.subtitle && (
          <p className="text-lg sm:text-xl text-muted-foreground mt-2">{auction.subtitle}</p>
        )}
        {auction.description && (
          <p className="text-muted-foreground mt-4 max-w-2xl">{auction.description}</p>
        )}

        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 mt-6 text-sm text-muted-foreground">
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
              {/* No serverNow: this page is ISR-cached, so a render timestamp
                  would inject stale skew; the client clock is the reference. */}
              Closes in: <AuctionCountdown
                endsAt={new Date(auction.biddingEndsAt)}
                className="font-medium text-foreground"
              />
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
      {lotsData.length > 0 ? (
        <LotGrid lots={lotsData} auctionSlug={auction.slug} />
      ) : (
        <div className="text-center py-16 border border-border/60 rounded-2xl px-6">
          <p className="font-display text-display-sm">The catalogue is being prepared</p>
          <p className="text-muted-foreground mt-2 max-w-sm mx-auto">
            Lots will appear here as soon as they are published.
          </p>
        </div>
      )}
    </div>
    </>
  );
}
