export const dynamic = 'force-dynamic';

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Image from 'next/image';
import { db } from '@/db';
import { lots, lotImages } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { BuyNowPanel } from '@/components/gallery/BuyNowPanel';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { formatCurrency } from '@/types';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://mayells.com';

async function getLot(lotId: string) {
  let [lot] = await db.select().from(lots).where(eq(lots.slug, lotId)).limit(1);
  if (!lot) {
    [lot] = await db.select().from(lots).where(eq(lots.id, lotId)).limit(1);
  }
  return lot;
}

export async function generateMetadata({ params }: { params: Promise<{ lotId: string }> }): Promise<Metadata> {
  const { lotId } = await params;
  const lot = await getLot(lotId);
  if (!lot) return {};

  const price = lot.buyNowPrice ? formatCurrency(lot.buyNowPrice) : undefined;
  const title = `${lot.title}${price ? ` — ${price}` : ''} | Mayell Gallery`;
  const description = lot.description?.slice(0, 160) || `${lot.title} available at Mayell Gallery.`;

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

export default async function GalleryDetailPage({
  params,
}: {
  params: Promise<{ lotId: string }>;
}) {
  const { lotId } = await params;

  const lot = await getLot(lotId);
  if (!lot || lot.saleType !== 'gallery') notFound();

  // Get images
  const images = await db
    .select()
    .from(lotImages)
    .where(eq(lotImages.lotId, lot.id))
    .orderBy(lotImages.sortOrder);

  // JSON-LD Product structured data
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: lot.title,
    description: lot.description,
    image: lot.primaryImageUrl || undefined,
    url: `${BASE_URL}/gallery/${lot.slug || lot.id}`,
    brand: { '@type': 'Organization', name: 'Mayell' },
    ...(lot.buyNowPrice ? {
      offers: {
        '@type': 'Offer',
        price: (lot.buyNowPrice / 100).toFixed(2),
        priceCurrency: 'USD',
        availability: lot.status === 'for_sale' ? 'https://schema.org/InStock' : 'https://schema.org/SoldOut',
        url: `${BASE_URL}/gallery/${lot.slug || lot.id}`,
      },
    } : {}),
    ...(lot.artist ? { creator: { '@type': 'Person', name: lot.artist } } : {}),
    ...(lot.condition ? { itemCondition: `https://schema.org/${lot.condition === 'mint' ? 'NewCondition' : 'UsedCondition'}` } : {}),
  };

  return (
    <>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
        {/* Left: Images + Details */}
        <div className="lg:col-span-2 space-y-8">
          {/* Image Gallery */}
          <div className="space-y-4">
            <div className="relative aspect-[4/3] bg-muted rounded-xl overflow-hidden">
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
                  <span className="font-logo text-lg text-muted-foreground/40">MAYELLS</span>
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
              <Badge className="bg-champagne text-charcoal border-0 text-[10px] uppercase tracking-wider font-semibold">
                Gallery
              </Badge>
              {lot.condition && (
                <Badge variant="secondary">{lot.condition.replace('_', ' ')}</Badge>
              )}
            </div>
            <h1 className="font-display text-display-md mb-2">{lot.title}</h1>
            {lot.subtitle && (
              <p className="text-lg text-muted-foreground">{lot.subtitle}</p>
            )}
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
        </div>

        {/* Right: Buy Now Panel */}
        <div>
          {lot.status === 'for_sale' && lot.buyNowPrice ? (
            <BuyNowPanel
              lotId={lot.id}
              title={lot.title}
              buyNowPrice={lot.buyNowPrice}
              estimateLow={lot.estimateLow}
              estimateHigh={lot.estimateHigh}
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
      </div>
    </div>
    </>
  );
}
