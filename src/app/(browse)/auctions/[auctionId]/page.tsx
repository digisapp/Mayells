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
import { auctionWithVisibleLotCount } from '@/components/auctions/visible-lot-count';
import { Badge } from '@/components/ui/badge';
import { LotGrid } from '@/components/lots/LotGrid';
import { AuctionCountdown } from '@/components/auctions/AuctionCountdown';
import { Calendar, Clock, Gavel, ExternalLink, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BackLink } from '@/components/lots/Breadcrumbs';
import { formatLongDate, formatSaleMoment } from '@/lib/format/dates';
import { generateAuctionJsonLd, generateBreadcrumbJsonLd, serializeJsonLd } from '@/lib/seo/structured-data';
import Link from 'next/link';
import { biddingVenue } from '@/lib/bidding/venue';

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

// Sale states before bidding opens, and after it has finished.
const NOT_YET_OPEN = ['draft', 'scheduled', 'preview'];
const FINISHED = ['closed', 'completed', 'cancelled'];

// cache(): generateMetadata and the page body share one lookup per request.
// Single query instead of a slug-then-id serial fallback (the id comparison is
// only attempted for UUID-shaped params — a non-UUID string would make the
// uuid-column cast throw). visibleLotCount is the grid's own filter, so the
// meta description, JSON-LD and the /auctions cards all quote the same number.
const getAuction = cache(async (auctionId: string) => {
  const [auction] = await db
    .select(auctionWithVisibleLotCount)
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
  const count = auction.visibleLotCount;
  const description = auction.description?.slice(0, 160)
    || (count > 0
      ? `${auction.title} — ${count} ${count === 1 ? 'lot' : 'lots'}. Browse and bid at Mayells.`
      : `${auction.title}. Browse and bid at Mayells.`);

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
  // fields; the projection above is the public subset of that row. It
  // carries status and hammerPrice, so sold lots read "Sold · $X".
  const lotsData = auctionLotsResult.map(({ lot, auctionLot }) => ({
    ...lot,
    lotNumber: auctionLot.lotNumber,
  })) as Lot[];

  // What the visitor can see in the grid, not the denormalized lotCount
  // (which also counts unpublished placements).
  const visibleLotCount = lotsData.length;

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
    lotCount: visibleLotCount,
  });

  const notYetOpen = NOT_YET_OPEN.includes(auction.status);
  const finished = FINISHED.includes(auction.status);
  const venue = biddingVenue(auction);
  const endedAt = auction.actualEndedAt ?? auction.biddingEndsAt;

  const breadcrumbJsonLd = generateBreadcrumbJsonLd([
    { name: 'Home', url: '/' },
    { name: 'Auctions', url: '/auctions' },
    { name: auction.title, url: `/auctions/${auction.slug || auction.id}` },
  ]);

  return (
    <>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} />
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbJsonLd) }} />
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-12 sm:pt-8">
      <BackLink href="/auctions" label="All auctions" />

      {/* Header */}
      <div className="mt-6 sm:mt-8 mb-8 sm:mb-10">
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

        {/* Sale timing, all in the house timezone (the server renders in UTC,
            which would put an evening close on the wrong day). */}
        <dl className="flex flex-wrap items-center gap-x-6 gap-y-3 mt-6 text-sm text-muted-foreground">
          {auction.previewStartsAt && notYetOpen && (
            <div className="flex items-center gap-1.5">
              <Eye className="h-4 w-4" aria-hidden />
              <dt>Preview from</dt>
              <dd className="text-foreground">{formatLongDate(auction.previewStartsAt)}</dd>
            </div>
          )}
          {auction.biddingStartsAt && !finished && (
            <div className="flex items-center gap-1.5">
              <Calendar className="h-4 w-4" aria-hidden />
              <dt>{notYetOpen ? 'Opens' : 'Opened'}</dt>
              <dd className="text-foreground">{formatSaleMoment(auction.biddingStartsAt)}</dd>
            </div>
          )}
          {auction.biddingEndsAt && !finished && (
            <div className="flex items-center gap-1.5">
              <Clock className="h-4 w-4" aria-hidden />
              <dt>Closes</dt>
              <dd className="text-foreground">
                {formatSaleMoment(auction.biddingEndsAt)}
                {(auction.status === 'open' || auction.status === 'live') && (
                  <>
                    {' '}
                    {/* No serverNow: this page is ISR-cached, so a render timestamp
                        would inject stale skew; the client clock is the reference.
                        Compact and icon-free so it runs on in the sentence. */}
                    <AuctionCountdown
                      endsAt={new Date(auction.biddingEndsAt)}
                      variant="compact"
                      showIcon={false}
                      prefix="(in "
                      suffix=")"
                      expiredLabel="(closing now)"
                    />
                  </>
                )}
              </dd>
            </div>
          )}
          {finished && endedAt && (
            <div className="flex items-center gap-1.5">
              <Calendar className="h-4 w-4" aria-hidden />
              <dt>Closed</dt>
              <dd className="text-foreground">{formatLongDate(endedAt)}</dd>
            </div>
          )}
          {visibleLotCount > 0 && (
            <div className="flex items-center gap-1.5">
              <Gavel className="h-4 w-4" aria-hidden />
              <dt className="sr-only">Lots</dt>
              <dd>{visibleLotCount} {visibleLotCount === 1 ? 'lot' : 'lots'}</dd>
            </div>
          )}
        </dl>

        {/* Where this sale is bid, and on what terms — each sale takes bids in
            one place only (lib/bidding/venue.ts); the conditions of sale on
            /terms refer bidders here for the venue and premium. */}
        {!finished && (
          <p className="mt-4 text-sm text-muted-foreground">
            {venue === 'liveauctioneers'
              ? 'Bidding for this sale takes place on LiveAuctioneers.'
              : 'Bidding for this sale takes place here on mayells.com.'}{' '}
            Buyer&rsquo;s premium {auction.buyerPremiumPercent}% of the hammer price.{' '}
            <Link href="/terms#conditions-of-sale" className="underline underline-offset-4 hover:text-foreground">
              Conditions of sale
            </Link>
          </p>
        )}

        {/* Bid CTA */}
        {venue === 'liveauctioneers' && auction.liveauctioneersUrl && !finished && (
          <div className="mt-6">
            <Button asChild variant="champagne" size="lg">
              <a href={auction.liveauctioneersUrl} target="_blank" rel="noopener noreferrer">
                Bid on LiveAuctioneers
                <ExternalLink className="h-4 w-4" />
              </a>
            </Button>
          </div>
        )}
      </div>

      {/* Lots grid — h2 keeps the outline h1 → h2 → (card) headings */}
      <h2 className="font-display text-display-sm mb-4 sm:mb-6">Lots</h2>
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
