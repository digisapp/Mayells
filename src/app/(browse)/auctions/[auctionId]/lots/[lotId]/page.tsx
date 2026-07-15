export const dynamic = 'force-dynamic';

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Image from 'next/image';
import { db } from '@/db';
import { lots, lotImages, auctionLots, auctions, bids } from '@/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { ShareButtons } from '@/components/lots/ShareButtons';
import { LiveLotPanel } from '@/components/lots/LiveLotPanel';
import { WatchButton } from '@/components/lots/WatchButton';
import { createClient } from '@/lib/supabase/server';
import { watchlist, users } from '@/db/schema';
import { isAdminProfile } from '@/lib/auth/admin';
import { isPubliclyVisibleLot } from '@/lib/lots/visibility';
import { Button } from '@/components/ui/button';
import { ExternalLink, Phone, Mail } from 'lucide-react';
import { BUSINESS } from '@/lib/config';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { formatCurrency } from '@/types';
import { generateLotJsonLd, generateBreadcrumbJsonLd, serializeJsonLd } from '@/lib/seo/structured-data';
import { categories } from '@/db/schema';
import { track } from '@vercel/analytics/server';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://mayells.com';

async function getLot(lotId: string) {
  let [lot] = await db.select().from(lots).where(eq(lots.slug, lotId)).limit(1);
  if (!lot) {
    [lot] = await db.select().from(lots).where(eq(lots.id, lotId)).limit(1);
  }
  return lot;
}

export async function generateMetadata({ params }: { params: Promise<{ auctionId: string; lotId: string }> }): Promise<Metadata> {
  const { auctionId, lotId } = await params;
  const lot = await getLot(lotId);
  if (!lot) return {};

  const estimate = lot.estimateLow && lot.estimateHigh
    ? `Est. ${formatCurrency(lot.estimateLow)} – ${formatCurrency(lot.estimateHigh)}`
    : undefined;
  const description = lot.description?.slice(0, 160) || `${lot.title}${estimate ? ` ${estimate}` : ''} at Mayells.`;
  const canonicalUrl = `${BASE_URL}/auctions/${auctionId}/lots/${lot.slug || lot.id}`;

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

  // Find lot by slug or ID
  let [lot] = await db.select().from(lots).where(eq(lots.slug, lotId)).limit(1);
  if (!lot) {
    [lot] = await db.select().from(lots).where(eq(lots.id, lotId)).limit(1);
  }
  if (!lot) notFound();

  // Fetch all lot-dependent data in parallel
  const [images, [auctionLot], bidHistory, categoryResult] = await Promise.all([
    db.select().from(lotImages).where(eq(lotImages.lotId, lot.id)).orderBy(lotImages.sortOrder),
    db.select().from(auctionLots).where(eq(auctionLots.lotId, lot.id)).limit(1),
    db.select().from(bids).where(eq(bids.lotId, lot.id)).orderBy(desc(bids.createdAt)).limit(20),
    lot.categoryId
      ? db.select().from(categories).where(eq(categories.id, lot.categoryId)).limit(1)
      : Promise.resolve([null]),
  ]);

  const [category] = categoryResult;

  // Auction record requires auctionLot.auctionId — one additional round-trip
  let auction = null;
  if (auctionLot) {
    [auction] = await db.select().from(auctions).where(eq(auctions.id, auctionLot.auctionId)).limit(1);
  }

  // Watch state + admin status for the signed-in viewer.
  const supabase = await createClient();
  const { data: { user: viewer } } = await supabase.auth.getUser();
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
  // to the public at their direct URL — admins may still preview them.
  if (!isPubliclyVisibleLot(lot.status) && !viewerIsAdmin) {
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
  const lotCloseAt = auctionLot?.closingAt ?? auction?.biddingEndsAt ?? null;
  const isBiddableOnSite =
    lot.status === 'in_auction' &&
    !!auction &&
    ['open', 'live', 'closed'].includes(auction.status) &&
    !!lotCloseAt &&
    lotCloseAt.getTime() > renderNow;

  // Rich JSON-LD for AI agents + search engines
  const lotJsonLd = generateLotJsonLd({
    ...lot,
    images: images.map(i => ({ url: i.url })),
    categoryName: category?.name || null,
  });

  const breadcrumbJsonLd = generateBreadcrumbJsonLd([
    { name: 'Home', url: '/' },
    { name: 'Auctions', url: '/auctions' },
    ...(auction ? [{ name: auction.title, url: `/auctions/${auction.slug || auction.id}` }] : []),
    { name: lot.title, url: `/auctions/${auctionId}/lots/${lot.slug || lot.id}` },
  ]);

  return (
    <>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(lotJsonLd) }} />
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbJsonLd) }} />
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
        {/* Left: Images + Details */}
        <div className="lg:col-span-2 space-y-8">
          {/* Image Gallery */}
          <div className="space-y-4">
            <div className="relative aspect-[4/3] bg-muted rounded-lg overflow-hidden">
              {lot.primaryImageUrl ? (
                <Image
                  src={lot.primaryImageUrl}
                  alt={lot.title}
                  fill
                  className="object-contain"
                  priority
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                  No Image Available
                </div>
              )}
            </div>
            {images.length > 1 && (
              <div className="grid grid-cols-6 gap-2">
                {images.map((img) => (
                  <div key={img.id} className="relative aspect-square bg-muted rounded overflow-hidden cursor-pointer hover:ring-2 ring-champagne">
                    <Image src={img.url} alt={img.altText || ''} fill className="object-cover" sizes="100px" />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Lot info */}
          <div>
            <div className="flex items-center gap-3 mb-2">
              {lot.lotNumber && (
                <Badge variant="outline">Lot {lot.lotNumber}</Badge>
              )}
              {lot.condition && (
                <Badge variant="secondary">{lot.condition.replace('_', ' ')}</Badge>
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
              <ShareButtons title={lot.title} url={`${BASE_URL}/auctions/${auctionId}/lots/${lot.slug || lot.id}`} />
            </div>
          </div>

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
              <div key={label} className="flex">
                <span className="w-36 text-sm text-muted-foreground shrink-0">{label}</span>
                <span className="text-sm">{value}</span>
              </div>
            ))}
          </div>

          <Separator />

          {/* Description */}
          <div>
            <h2 className="font-display text-xl mb-3">Description</h2>
            <div className="prose prose-sm max-w-none text-muted-foreground whitespace-pre-wrap">
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
                <h2 className="font-display text-xl mb-3">Bid History ({bidHistory.length})</h2>
                <div className="space-y-2">
                  {bidHistory.map((bid, i) => (
                    <div key={bid.id} className="flex items-center justify-between text-sm py-2 border-b border-border/30 last:border-0">
                      <span className="text-muted-foreground">
                        {i === 0 ? 'Current bid' : `Bid ${bidHistory.length - i}`}
                      </span>
                      <span className="font-medium">{formatCurrency(bid.amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Right: Auction Info + Bid CTA */}
        <div className="space-y-4 sticky top-24">
          <div className="bg-card border border-border/50 rounded-xl p-6 space-y-5 shadow-luxury">
            {/* Live-updating estimate / current bid + countdown + on-site bidding */}
            <LiveLotPanel
              lotRef={lot.slug || lot.id}
              initialCurrentBidAmount={lot.currentBidAmount}
              initialBidCount={lot.bidCount}
              startingBid={lot.startingBid ?? 0}
              estimateLow={lot.estimateLow ?? null}
              estimateHigh={lot.estimateHigh ?? null}
              closingAt={
                (auctionLot?.closingAt ?? auction?.biddingEndsAt)?.toISOString() ?? null
              }
              serverNow={renderNow}
              initialIsBiddable={isBiddableOnSite}
              initialIsHighBidder={!!viewer && lot.currentBidderId === viewer.id}
            />

            {/* When the lot is biddable on-site, the bid form (inside LiveLotPanel
                above) is the primary CTA. Otherwise fall back to LiveAuctioneers
                or an informational message. */}
            {!isBiddableOnSite && (
              auction?.liveauctioneersUrl ? (
                <a href={auction.liveauctioneersUrl} target="_blank" rel="noopener noreferrer">
                  <Button variant="champagne" size="xl" className="w-full gap-2">
                    <ExternalLink className="h-5 w-5" />
                    Bid on LiveAuctioneers
                  </Button>
                </a>
              ) : auction ? (
                <p className="text-sm text-muted-foreground">This lot is not open for bidding right now.</p>
              ) : (
                <p className="text-sm text-muted-foreground">This lot is not currently in an active auction.</p>
              )
            )}
            {/* Secondary link to LiveAuctioneers even while biddable on-site */}
            {isBiddableOnSite && auction?.liveauctioneersUrl && (
              <a
                href={auction.liveauctioneersUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Also available on LiveAuctioneers
              </a>
            )}

            {/* Alternative bidding */}
            <div className="border-t border-border/30 pt-4 space-y-3">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Or bid by phone / absentee</p>
              <a href={BUSINESS.phoneHref} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
                <Phone className="h-4 w-4" />
                {BUSINESS.phone}
              </a>
              <a href={`mailto:${BUSINESS.email}?subject=${encodeURIComponent(`Bid Inquiry: ${lot.title}`)}`} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
                <Mail className="h-4 w-4" />
                {BUSINESS.email}
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
    </>
  );
}
