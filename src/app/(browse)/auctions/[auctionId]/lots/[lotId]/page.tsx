export const dynamic = 'force-dynamic';

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Image from 'next/image';
import { db } from '@/db';
import { lots, lotImages, auctionLots, auctions, bids } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';
import { BidPanel } from '@/components/bidding/BidPanel';
import { RemindMeButton } from '@/components/bidding/RemindMeButton';
import { ShareButtons } from '@/components/lots/ShareButtons';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { formatCurrency } from '@/types';
import { generateLotJsonLd, generateBreadcrumbJsonLd } from '@/lib/seo/structured-data';
import { categories } from '@/db/schema';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://mayells.com';

async function getLot(lotId: string) {
  let [lot] = await db.select().from(lots).where(eq(lots.slug, lotId)).limit(1);
  if (!lot) {
    [lot] = await db.select().from(lots).where(eq(lots.id, lotId)).limit(1);
  }
  return lot;
}

export async function generateMetadata({ params }: { params: Promise<{ auctionId: string; lotId: string }> }): Promise<Metadata> {
  const { lotId } = await params;
  const lot = await getLot(lotId);
  if (!lot) return {};

  const estimate = lot.estimateLow && lot.estimateHigh
    ? `Est. ${formatCurrency(lot.estimateLow)} – ${formatCurrency(lot.estimateHigh)}`
    : undefined;
  const description = lot.description?.slice(0, 160) || `${lot.title}${estimate ? ` ${estimate}` : ''} at Mayell Auctions.`;

  return {
    title: lot.title,
    description,
    openGraph: {
      title: lot.title,
      description,
      type: 'website',
      url: `${BASE_URL}/auctions/${lot.id}/lots/${lot.slug || lot.id}`,
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

  // Get images
  const images = await db
    .select()
    .from(lotImages)
    .where(eq(lotImages.lotId, lot.id))
    .orderBy(lotImages.sortOrder);

  // Get auction info
  const [auctionLot] = await db
    .select()
    .from(auctionLots)
    .where(eq(auctionLots.lotId, lot.id))
    .limit(1);

  let auction = null;
  if (auctionLot) {
    [auction] = await db
      .select()
      .from(auctions)
      .where(eq(auctions.id, auctionLot.auctionId))
      .limit(1);
  }

  // Get bid history
  const bidHistory = await db
    .select()
    .from(bids)
    .where(eq(bids.lotId, lot.id))
    .orderBy(desc(bids.createdAt))
    .limit(20);

  // Get category name for structured data
  const [category] = lot.categoryId
    ? await db.select().from(categories).where(eq(categories.id, lot.categoryId)).limit(1)
    : [null];

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
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(lotJsonLd) }} />
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
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
              {auction && <RemindMeButton lotId={lot.id} />}
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

        {/* Right: Bid Panel */}
        <div>
          {auction && auctionLot ? (
            <BidPanel
              lotId={lot.id}
              auctionId={auction.id}
              currentBid={lot.currentBidAmount}
              bidCount={lot.bidCount}
              closingAt={auctionLot.closingAt}
              estimateLow={lot.estimateLow}
              estimateHigh={lot.estimateHigh}
              startingBid={lot.startingBid}
            />
          ) : (
            <div className="bg-card border border-border/50 rounded-lg p-6">
              <p className="text-muted-foreground">This lot is not currently in an active auction.</p>
              {lot.estimateLow && lot.estimateHigh && (
                <p className="mt-2 text-sm">
                  Estimate: {formatCurrency(lot.estimateLow)} — {formatCurrency(lot.estimateHigh)}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
    </>
  );
}
