// Stays dynamic: the page is personalized (watch state, admin preview,
// clock-skew seed). The waterfall below is trimmed instead: cached lot
// lookup shared with generateMetadata, one OR-query instead of a serial
// slug→id fallback, and the auth round trip runs alongside the data batch.
export const dynamic = 'force-dynamic';

import { cache } from 'react';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { db } from '@/db';
import { lots, lotImages, auctionLots, auctions, bids } from '@/db/schema';
import { eq, and, asc, desc, gt, lt, or, inArray } from 'drizzle-orm';
import { ShareButtons } from '@/components/lots/ShareButtons';
import { LotImageGallery } from '@/components/lots/LotImageGallery';
import { LiveLotPanel } from '@/components/lots/LiveLotPanel';
import { WatchButton } from '@/components/lots/WatchButton';
import { createClient } from '@/lib/supabase/server';
import { watchlist, users } from '@/db/schema';
import { isAdminProfile } from '@/lib/auth/admin';
import { isPubliclyVisibleLot, PUBLIC_CATALOGUE_LOT_STATUSES } from '@/lib/lots/visibility';
import { isPubliclyVisibleAuction } from '@/lib/auctions/visibility';
import { isOnSiteBiddingSale } from '@/lib/bidding/venue';
import { isLotInPublicAuction } from '@/lib/lots/placement';
import { Phone, Mail } from 'lucide-react';
import { BUSINESS } from '@/lib/config';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { formatCurrency } from '@/types';
import { formatEstimate } from '@/lib/format/estimate';
import { formatSaleMoment } from '@/lib/format/dates';
import { Breadcrumbs, LotPager, type SiblingLot } from '@/components/lots/Breadcrumbs';
import { formatCondition } from '@/components/lots/condition';
import { generateLotJsonLd, generateBreadcrumbJsonLd, serializeJsonLd } from '@/lib/seo/structured-data';
import { categories } from '@/db/schema';
import { track } from '@vercel/analytics/server';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://mayells.com';

// Bid history shows the latest bids only; the heading carries the full count.
const BID_HISTORY_LIMIT = 20;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// cache(): generateMetadata and the page body share one lookup per request.
// The id comparison is only attempted for UUID-shaped params — a non-UUID
// string would make the uuid-column cast throw.
const getLot = cache(async (lotId: string) => {
  const [lot] = await db
    .select()
    .from(lots)
    .where(
      UUID_RE.test(lotId)
        ? or(eq(lots.id, lotId), eq(lots.slug, lotId))
        : eq(lots.slug, lotId),
    )
    .limit(1);
  return lot;
});

// The sale named in the URL (slug, or id for old links), and this lot's
// placement in it. A lot can be relisted in several sales, so the placement
// is always looked up for *this* sale — never "any" auction_lots row.
const getSalePlacement = cache(async (auctionId: string, lotUuid: string) => {
  const [row] = await db
    .select({ auction: auctions, auctionLot: auctionLots })
    .from(auctionLots)
    .innerJoin(auctions, eq(auctions.id, auctionLots.auctionId))
    .where(and(
      eq(auctionLots.lotId, lotUuid),
      UUID_RE.test(auctionId)
        ? or(eq(auctions.id, auctionId), eq(auctions.slug, auctionId))
        : eq(auctions.slug, auctionId),
    ))
    .limit(1);
  return row ?? null;
});

// One URL per lot per sale: slugs, never the ids an old link may carry.
const lotPath = (saleSlug: string, lot: { slug: string | null; id: string }) =>
  `/auctions/${saleSlug}/lots/${lot.slug || lot.id}`;

export async function generateMetadata({ params }: { params: Promise<{ auctionId: string; lotId: string }> }): Promise<Metadata> {
  const { auctionId, lotId } = await params;
  const lot = await getLot(lotId);
  if (!lot) return {};
  // Not in this sale: the page redirects, so there is nothing to describe.
  const placement = await getSalePlacement(auctionId, lot.id);
  if (!placement || !isPubliclyVisibleAuction(placement.auction.status)) return {};

  const estimateText = formatEstimate(lot.estimateLow, lot.estimateHigh);
  // Mid-sentence: "Est. $5,000+", "Est. up to $2,000".
  const estimate = estimateText ? `Est. ${estimateText.replace(/^Up to/, 'up to')}` : undefined;
  const description = lot.description?.slice(0, 160) || `${lot.title}${estimate ? ` ${estimate}` : ''} at Mayells.`;
  // Canonical to the sale's real slug, so /auctions/<anything>/lots/<lot>
  // can no longer canonicalize itself.
  const canonicalUrl = `${BASE_URL}${lotPath(placement.auction.slug, lot)}`;

  return {
    title: lot.title,
    description,
    alternates: { canonical: canonicalUrl },
    openGraph: {
      title: lot.title,
      description,
      type: 'website',
      url: canonicalUrl,
      images: lot.primaryImageUrl ? [{ url: lot.primaryImageUrl, width: 1200, height: 630, alt: lot.title }] : undefined,
    },
    twitter: {
      card: 'summary_large_image',
      title: lot.title,
      description,
      images: lot.primaryImageUrl ? [lot.primaryImageUrl] : undefined,
    },
  };
}

export default async function LotDetailPage({
  params,
}: {
  params: Promise<{ auctionId: string; lotId: string }>;
}) {
  const { auctionId, lotId } = await params;

  // Shared (cached) lookup with generateMetadata — one query per request.
  const lot = await getLot(lotId);
  if (!lot) notFound();

  // The lot must actually be in the sale the URL names. If it isn't (a stale
  // or hand-edited link), let the /lots resolver send it to its real sale —
  // or to the gallery, or a 404.
  const placement = await getSalePlacement(auctionId, lot.id);
  if (!placement) redirect(`/lots/${lot.slug || lot.id}`);
  const { auction, auctionLot } = placement;
  // The number in *this* sale (a relisted lot is renumbered per sale).
  const lotNumber = auctionLot.lotNumber;
  const canonicalPath = lotPath(auction.slug, lot);

  // Neighbours in this sale's catalogue order, among the lots the sale page
  // itself lists (so prev/next never lands on a hidden lot).
  const siblingQuery = (dir: 'prev' | 'next') =>
    db
      .select({ lotNumber: auctionLots.lotNumber, slug: lots.slug, id: lots.id, title: lots.title })
      .from(auctionLots)
      .innerJoin(lots, eq(lots.id, auctionLots.lotId))
      .where(and(
        eq(auctionLots.auctionId, auction.id),
        inArray(lots.status, [...PUBLIC_CATALOGUE_LOT_STATUSES]),
        dir === 'prev'
          ? lt(auctionLots.lotNumber, auctionLot.lotNumber)
          : gt(auctionLots.lotNumber, auctionLot.lotNumber),
      ))
      .orderBy(dir === 'prev' ? desc(auctionLots.lotNumber) : asc(auctionLots.lotNumber))
      .limit(1);

  // Fetch all lot-dependent data AND the viewer's auth state in parallel —
  // the Supabase Auth round trip is independent of the lot queries.
  const supabase = await createClient();
  const [images, bidHistory, categoryResult, [prevRow], [nextRow], { data: { user: viewer } }] = await Promise.all([
    db.select().from(lotImages).where(eq(lotImages.lotId, lot.id)).orderBy(lotImages.sortOrder),
    db.select().from(bids).where(eq(bids.lotId, lot.id)).orderBy(desc(bids.createdAt)).limit(BID_HISTORY_LIMIT),
    lot.categoryId
      ? db.select().from(categories).where(eq(categories.id, lot.categoryId)).limit(1)
      : Promise.resolve([null]),
    siblingQuery('prev'),
    siblingQuery('next'),
    supabase.auth.getUser(),
  ]);

  const [category] = categoryResult;
  const toSibling = (row: typeof prevRow | undefined): SiblingLot | null =>
    row ? { href: lotPath(auction.slug, row), lotNumber: row.lotNumber, title: row.title } : null;

  // Watch state + admin status for the signed-in viewer.
  let isWatching = false;
  let viewerIsAdmin = false;
  if (viewer) {
    const [[w], [profile]] = await Promise.all([
      db
        .select({ id: watchlist.id })
        .from(watchlist)
        .where(and(eq(watchlist.userId, viewer.id), eq(watchlist.lotId, lot.id)))
        .limit(1),
      db
        .select({ role: users.role, isAdmin: users.isAdmin })
        .from(users)
        .where(eq(users.id, viewer.id))
        .limit(1),
    ]);
    isWatching = !!w;
    viewerIsAdmin = isAdminProfile(profile);
  }

  // Never expose unpublished lots (draft / pending_review / withdrawn / unsold)
  // to the public at their direct URL — admins may still preview them. A lot
  // catalogued in a scheduled/preview sale stays `approved` until bidding
  // opens, so it counts as visible when its sale is public.
  const inPublicAuction = lot.status === 'approved' ? await isLotInPublicAuction(lot.id) : false;
  if (!isPubliclyVisibleLot(lot.status, inPublicAuction) && !viewerIsAdmin) {
    notFound();
  }
  // The sale named in the URL must itself be public: a public lot can also be
  // placed in a draft or cancelled sale, whose title and unpublished
  // neighbours (breadcrumb, prev/next, JSON-LD) must not show. No redirect —
  // the /lots resolver can pick that same sale and loop.
  if (!isPubliclyVisibleAuction(auction.status) && !viewerIsAdmin) {
    notFound();
  }

  void track('lot_viewed', { lotId: lot.id, saleType: lot.saleType, status: lot.status });

  // Server component renders once per request, so this is the authoritative
  // request time — used for the client countdown's clock-skew correction and
  // the biddable check.
  // eslint-disable-next-line react-hooks/purity
  const renderNow = Date.now();

  // Whether this lot can be bid on directly on Mayells right now (drives the
  // on-site bid form vs. the external/absentee fallbacks).
  const lotCloseAt = auctionLot.closingAt ?? auction.biddingEndsAt ?? null;
  const isBiddableOnSite =
    isOnSiteBiddingSale(auction) &&
    lot.status === 'in_auction' &&
    ['open', 'live', 'closed'].includes(auction.status) &&
    !!lotCloseAt &&
    lotCloseAt.getTime() > renderNow;
  // Not biddable because it's over (vs. not open yet): drives "Sold for" /
  // "Bidding closed" in the panel instead of a stale "Current Bid".
  // A sale run on LiveAuctioneers often goes on past its scheduled close, so
  // elapsed time alone doesn't end it while the sale is still in progress —
  // the external bid button must stay up until the house settles the lot.
  const saleInProgress =
    !!auction.liveauctioneersUrl && ['open', 'live', 'closing'].includes(auction.status);
  const biddingClosed =
    !isBiddableOnSite &&
    (lot.status === 'sold' ||
      lot.status === 'unsold' ||
      ['completed', 'cancelled'].includes(auction.status) ||
      (!saleInProgress && !!lotCloseAt && lotCloseAt.getTime() <= renderNow));
  // Formatted here, not in the client panel: server and browser can't then
  // disagree on the text (year cut-off, ICU spacing) and trip hydration.
  const opensAtLabel =
    !isBiddableOnSite && !biddingClosed && auction.biddingStartsAt && auction.biddingStartsAt.getTime() > renderNow
      ? formatSaleMoment(auction.biddingStartsAt, new Date(renderNow))
      : null;
  // The bids table only holds the latest few here; the lot row has the total.
  const totalBids = Math.max(lot.bidCount, bidHistory.length);

  // Rich JSON-LD for AI agents + search engines
  const lotJsonLd = generateLotJsonLd({
    ...lot,
    images: images.map(i => ({ url: i.url })),
    categoryName: category?.name || null,
  });

  const breadcrumbJsonLd = generateBreadcrumbJsonLd([
    { name: 'Home', url: '/' },
    { name: 'Auctions', url: '/auctions' },
    { name: auction.title, url: `/auctions/${auction.slug}` },
    { name: lot.title, url: canonicalPath },
  ]);

  const galleryImages = images.length
    ? images.map((img) => ({ url: img.url, alt: img.altText || lot.title }))
    : lot.primaryImageUrl
      ? [{ url: lot.primaryImageUrl, alt: lot.title }]
      : [];

  return (
    <>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(lotJsonLd) }} />
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbJsonLd) }} />
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-12 sm:pt-8">
      <div className="mb-6 sm:mb-8 flex items-center justify-between gap-x-4 sm:gap-x-6">
        <Breadcrumbs
          className="flex-1"
          items={[
            // Phones drop the root so the sale title, not "…", sits
            // beside the pager on one line.
            { label: 'Auctions', href: '/auctions', hideOnPhone: true },
            { label: auction.title, href: `/auctions/${auction.slug}` },
            { label: `Lot ${lotNumber}` },
          ]}
        />
        <LotPager prev={toSibling(prevRow)} next={toSibling(nextRow)} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 lg:gap-10">
        {/* Images + title — first on mobile so the bid panel lands right after */}
        <div className="lg:col-span-2 space-y-8">
          {/* Image Gallery — swipeable on touch, tap to open the lightbox */}
          {galleryImages.length > 0 ? (
            <LotImageGallery images={galleryImages} heroClassName="rounded-lg" />
          ) : (
            <div className="relative aspect-[4/3] bg-muted rounded-lg overflow-hidden">
              <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                No Image Available
              </div>
            </div>
          )}

          {/* Lot info */}
          <div>
            <div className="flex items-center gap-3 mb-2">
              <Badge variant="outline">Lot {lotNumber}</Badge>
              {lot.condition && (
                <Badge variant="secondary">{formatCondition(lot.condition)}</Badge>
              )}
            </div>
            <h1 className="font-display text-display-md mb-2">{lot.title}</h1>
            {lot.subtitle && (
              <p className="text-lg text-muted-foreground">{lot.subtitle}</p>
            )}
            <div className="flex flex-wrap items-center gap-3 mt-3">
              <WatchButton
                lotId={lot.id}
                initialWatching={isWatching}
                loggedIn={!!viewer}
                lotRef={lot.slug || lot.id}
              />
              <ShareButtons title={lot.title} url={`${BASE_URL}${canonicalPath}`} />
            </div>
          </div>
        </div>

        {/* Auction Info + Bid CTA — right column on desktop; on mobile it sits
            directly under the title so bidding never requires scrolling past
            the full catalog entry */}
        <div className="lg:row-span-2">
          <div className="space-y-4 lg:sticky lg:top-24">
          <div className="bg-card border border-border/50 rounded-xl p-6 space-y-5 shadow-luxury">
            {/* Live-updating estimate / current bid + countdown + on-site bidding */}
            <LiveLotPanel
              lotId={lot.id}
              lotRef={lot.slug || lot.id}
              initialCurrentBidAmount={lot.currentBidAmount}
              initialBidCount={lot.bidCount}
              startingBid={lot.startingBid ?? 0}
              estimateLow={lot.estimateLow ?? null}
              estimateHigh={lot.estimateHigh ?? null}
              closingAt={lotCloseAt?.toISOString() ?? null}
              serverNow={renderNow}
              initialIsBiddable={isBiddableOnSite}
              lotStatus={lot.status}
              hammerPrice={lot.hammerPrice ?? null}
              biddingClosed={biddingClosed}
              externalSaleInProgress={saleInProgress}
              opensAtLabel={opensAtLabel}
              initialIsHighBidder={!!viewer && lot.currentBidderId === viewer.id}
              viewerSignedIn={!!viewer}
              lotTitle={lot.title}
              buyerPremiumPercent={auction.buyerPremiumPercent}
              // The panel owns the call to action (on-site bid form, else
              // LiveAuctioneers, else a note) so the phone bid bar can mirror it.
              externalBidUrl={auction.liveauctioneersUrl ?? null}
              unavailableNote="This lot is not open for bidding right now."
            />

            {/* Alternative bidding */}
            <div className="border-t border-border/30 pt-4">
              <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Or bid by phone / absentee</p>
              <a href={BUSINESS.phoneHref} className="flex min-h-11 items-center gap-2.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
                <Phone className="h-4 w-4" />
                {BUSINESS.phone}
              </a>
              <a href={`mailto:${BUSINESS.email}?subject=${encodeURIComponent(`Bid Inquiry: ${lot.title}`)}`} className="flex min-h-11 items-center gap-2.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
                <Mail className="h-4 w-4" />
                {BUSINESS.email}
              </a>
            </div>
          </div>
          </div>
        </div>

        {/* Catalog details */}
        <div className="lg:col-span-2 space-y-8">
          {/* Details table */}
          <div className="space-y-3">
            {[
              { label: 'Artist / Maker', value: lot.artist || lot.maker },
              { label: 'Period', value: lot.period },
              { label: 'Circa', value: lot.circa },
              { label: 'Origin', value: lot.origin },
              { label: 'Medium', value: lot.medium },
              { label: 'Dimensions', value: lot.dimensions },
              { label: 'Weight', value: lot.weight },
            ].filter(({ value }) => value).map(({ label, value }) => (
              <div key={label} className="flex flex-col gap-0.5 sm:flex-row">
                <span className="sm:w-36 text-sm text-muted-foreground shrink-0">{label}</span>
                <span className="text-sm">{value}</span>
              </div>
            ))}
          </div>

          <Separator />

          {/* Description */}
          <div>
            <h2 className="font-display text-xl mb-3">Description</h2>
            <div className="text-muted-foreground whitespace-pre-wrap">
              {lot.description}
            </div>
          </div>

          {lot.provenance && (
            <>
              <Separator />
              <div>
                <h2 className="font-display text-xl mb-3">Provenance</h2>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{lot.provenance}</p>
              </div>
            </>
          )}

          {lot.conditionNotes && (
            <>
              <Separator />
              <div>
                <h2 className="font-display text-xl mb-3">Condition Report</h2>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{lot.conditionNotes}</p>
              </div>
            </>
          )}

          {/* Bid History */}
          {bidHistory.length > 0 && (
            <>
              <Separator />
              <div>
                <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4">
                  <h2 className="font-display text-xl">Bid History ({totalBids})</h2>
                  {totalBids > bidHistory.length && (
                    <p className="text-sm text-muted-foreground">Showing latest {bidHistory.length}</p>
                  )}
                </div>
                <div className="space-y-2">
                  {bidHistory.map((bid, i) => (
                    <div key={bid.id} className="flex items-center justify-between text-sm py-2 border-b border-border/30 last:border-0">
                      <span className="text-muted-foreground">
                        {i === 0 && !biddingClosed ? 'Current bid' : `Bid ${totalBids - i}`}
                      </span>
                      <span className="font-medium">{formatCurrency(bid.amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
    </>
  );
}
