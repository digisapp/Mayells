export const dynamic = 'force-dynamic';

import { cache } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { db } from '@/db';
import { lots, lotImages, invoices } from '@/db/schema';
import { and, eq, inArray, or } from 'drizzle-orm';
import { isPubliclyVisibleLot } from '@/lib/lots/visibility';
import { isLotInPublicAuction } from '@/lib/lots/placement';
import { BuyNowPanel, type BuyNowPanelState } from '@/components/gallery/BuyNowPanel';
import { galleryPurchaseState, type GalleryReservation } from '@/lib/gallery/purchase-state';
import { GALLERY_CHECKOUT, isGallerySalesTaxEnabled } from '@/lib/gallery/config';
import { isStripeConfigured } from '@/lib/stripe/config';
import { createClient } from '@/lib/supabase/server';
import { LotImageGallery } from '@/components/lots/LotImageGallery';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { formatCurrency } from '@/types';
import { formatCondition } from '@/components/lots/condition';
import { Breadcrumbs } from '@/components/lots/Breadcrumbs';
import { generateLotJsonLd, generateBreadcrumbJsonLd, serializeJsonLd } from '@/lib/seo/structured-data';
import { track } from '@vercel/analytics/server';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://mayells.com';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// cache(): generateMetadata and the page body share one lookup per request;
// single OR-query instead of a serial slug→id fallback (id compare only for
// UUID-shaped params so the uuid cast can't throw). Resolves only a lot the
// public may see here, so the 404 and the metadata can't disagree.
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
  // Gallery detail serves both gallery fixed-price lots and private-sale lots
  // (which render an inquiry panel) — LotCard links both here.
  if (!lot || (lot.saleType !== 'gallery' && lot.saleType !== 'private')) return undefined;
  // An `approved` lot is only visible while catalogued in a public sale.
  const inPublicAuction = lot.status === 'approved' ? await isLotInPublicAuction(lot.id) : false;
  return isPubliclyVisibleLot(lot.status, inPublicAuction) ? lot : undefined;
});

export async function generateMetadata({ params }: { params: Promise<{ lotId: string }> }): Promise<Metadata> {
  const { lotId } = await params;
  const lot = await getLot(lotId);
  if (!lot) return {};

  const price = lot.buyNowPrice ? formatCurrency(lot.buyNowPrice) : undefined;
  // The root template adds " | Mayells".
  const title = `${lot.title}${price ? ` — ${price}` : ''}`;
  const description = lot.description?.slice(0, 160) || `${lot.title} available at Mayells Gallery.`;

  const canonicalUrl = `${BASE_URL}/gallery/${lot.slug || lot.id}`;

  return {
    title,
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

/** The lot's live invoice — a Buy Now hold or a client's invoice — if one reserves it. */
async function getReservation(lotId: string): Promise<GalleryReservation | null> {
  const [row] = await db
    .select({ buyerId: invoices.buyerId, holdExpiresAt: invoices.holdExpiresAt, accessToken: invoices.accessToken })
    .from(invoices)
    .where(and(eq(invoices.lotId, lotId), inArray(invoices.status, ['pending', 'overdue'])))
    .limit(1);
  return row ?? null;
}

async function getViewerId(): Promise<string | null> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    return user?.id ?? null;
  } catch {
    // Auth unavailable: the page still renders, as for a signed-out visitor.
    return null;
  }
}

/** The panel's state, without anything (like another buyer's invoice link) the viewer mustn't see. */
function panelState(state: ReturnType<typeof galleryPurchaseState>): BuyNowPanelState | null {
  switch (state.kind) {
    case 'held_for_you':
    case 'on_hold':
      return { kind: state.kind, until: state.until.toISOString() };
    case 'invoiced_to_you':
      return { kind: 'invoiced_to_you', accessToken: state.accessToken };
    case 'buy':
    case 'reserved':
    case 'inquire':
      return { kind: state.kind };
    default:
      return null;
  }
}

export default async function GalleryDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ lotId: string }>;
  searchParams: Promise<{ buy?: string; checkout?: string }>;
}) {
  const { lotId } = await params;
  const { buy, checkout } = await searchParams;

  const lot = await getLot(lotId);
  if (!lot) notFound();

  void track('gallery_item_viewed', { lotId: lot.id, status: lot.status });

  const [images, reservation, viewerId] = await Promise.all([
    db
      .select()
      .from(lotImages)
      .where(eq(lotImages.lotId, lot.id))
      .orderBy(lotImages.sortOrder),
    lot.status === 'for_sale' ? getReservation(lot.id) : Promise.resolve(null),
    getViewerId(),
  ]);

  const purchase = galleryPurchaseState({
    lot,
    reservation,
    viewerId,
    checkoutConfigured: isStripeConfigured(),
    now: new Date(),
  });
  const panel = panelState(purchase);
  const lotPath = `/gallery/${lot.slug || lot.id}`;

  const jsonLd = generateLotJsonLd({
    ...lot,
    images: images.map(i => ({ url: i.url })),
  });

  const breadcrumbJsonLd = generateBreadcrumbJsonLd([
    { name: 'Home', url: '/' },
    { name: 'Gallery', url: '/gallery' },
    { name: lot.title, url: `/gallery/${lot.slug || lot.id}` },
  ]);

  const galleryImages = images.length
    ? images.map((img) => ({ url: img.url, alt: img.altText || lot.title }))
    : lot.primaryImageUrl
      ? [{ url: lot.primaryImageUrl, alt: lot.title }]
      : [];

  return (
    <>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} />
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbJsonLd) }} />
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-12 sm:pt-8">
      <Breadcrumbs
        className="mb-6 sm:mb-8"
        items={[{ label: 'Gallery', href: '/gallery' }, { label: lot.title }]}
      />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 lg:gap-10">
        {/* Images + title — first on mobile so the purchase panel lands right after */}
        <div className="lg:col-span-2 space-y-8">
          {/* Image Gallery — swipeable on touch, tap to open the lightbox */}
          {galleryImages.length > 0 ? (
            <LotImageGallery images={galleryImages} heroClassName="rounded-xl" />
          ) : (
            <div className="relative aspect-[4/3] bg-muted rounded-xl overflow-hidden">
              <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                <span className="font-logo text-lg text-muted-foreground/40">MAYELLS</span>
              </div>
            </div>
          )}

          {/* Lot info */}
          <div>
            <div className="flex items-center gap-3 mb-2">
              <Badge className="bg-champagne text-charcoal border-0 text-xs uppercase tracking-wider font-semibold">
                Gallery
              </Badge>
              {lot.condition && (
                <Badge variant="secondary">{formatCondition(lot.condition)}</Badge>
              )}
            </div>
            <h1 className="font-display text-display-md mb-2">{lot.title}</h1>
            {lot.subtitle && (
              <p className="text-lg text-muted-foreground">{lot.subtitle}</p>
            )}
          </div>
        </div>

        {/* Purchase panel — right column on desktop; on mobile it sits directly
            under the title so the purchase CTA never requires scrolling past
            the full catalog entry */}
        <div className="lg:row-span-2">
          {/* Buy Now, a hold, or an inquiry (lib/gallery/purchase-state.ts). A
              private sale may be offered without a published price: the same
              panel, as a price inquiry. */}
          {panel ? (
            <BuyNowPanel
              lotId={lot.id}
              lotPath={lotPath}
              title={lot.title}
              buyNowPrice={lot.buyNowPrice || null}
              estimateLow={lot.estimateLow}
              estimateHigh={lot.estimateHigh}
              shippingPrice={lot.onlineCheckout ? lot.shippingPrice : null}
              state={panel}
              signedIn={!!viewerId}
              salesTax={isGallerySalesTaxEnabled()}
              guaranteeDays={GALLERY_CHECKOUT.guaranteeDays}
              intent={buy === '1' ? 'buy' : checkout === 'cancelled' ? 'cancelled' : null}
            />
          ) : (
            <div className="bg-card border border-border/50 rounded-xl p-6 shadow-luxury">
              <p className="font-display text-lg mb-1">
                {lot.status === 'sold' ? 'Sold' : 'Not Available'}
              </p>
              <p className="text-sm text-muted-foreground">
                {lot.status === 'sold'
                  ? 'This item has been sold.'
                  : 'This item is not currently available for purchase.'}
              </p>
            </div>
          )}
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
        </div>
      </div>
    </div>
    </>
  );
}
