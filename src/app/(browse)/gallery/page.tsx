export const dynamic = 'force-dynamic';

import { db } from '@/db';
import { lots, categories } from '@/db/schema';
import { eq, and, desc, asc, ilike, sql } from 'drizzle-orm';
import { LotGrid } from '@/components/lots/LotGrid';
import type { Lot } from '@/db/schema/lots';
import { logger } from '@/lib/logger';

export const metadata = {
  title: 'Gallery',
  description: 'Browse and buy luxury art, antiques, and collectibles at fixed prices from Mayells.',
  openGraph: {
    title: 'Gallery | Mayells',
    description: 'Browse and buy luxury art, antiques, and collectibles at fixed prices.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Gallery | Mayells',
    description: 'Browse and buy luxury art, antiques, and collectibles at fixed prices.',
  },
};

export default async function GalleryPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | undefined }>;
}) {
  const params = await searchParams;
  const sort = params.sort ?? 'newest';
  const search = params.q;
  const categorySlug = params.category;

  const conditions = [
    eq(lots.saleType, 'gallery'),
    eq(lots.status, 'for_sale'),
  ];

  if (search) {
    conditions.push(ilike(lots.title, `%${search}%`));
  }
  if (categorySlug) {
    conditions.push(eq(lots.categoryId, categorySlug));
  }

  const orderBy = sort === 'price_asc'
    ? asc(lots.buyNowPrice)
    : sort === 'price_desc'
      ? desc(lots.buyNowPrice)
      : desc(lots.createdAt);

  let galleryLots: Lot[] = [];
  try {
    galleryLots = await db
      .select()
      .from(lots)
      .where(and(...conditions))
      .orderBy(orderBy)
      .limit(48);
  } catch (error) {
    logger.error('Gallery page DB error', error);
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      {/* Header */}
      <div className="text-center mb-12">
        <h1 className="font-display text-display-lg mb-3">Gallery</h1>
        <p className="text-muted-foreground max-w-xl mx-auto">
          Curated luxury pieces available for immediate purchase. No bidding — just find what you love and buy it.
        </p>
      </div>

      {/* Sort controls */}
      <div className="flex items-center justify-between mb-8">
        <p className="text-sm text-muted-foreground">
          {galleryLots.length} item{galleryLots.length !== 1 ? 's' : ''}
        </p>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Sort by:</span>
          <div className="flex gap-1">
            {[
              { label: 'Newest', value: 'newest' },
              { label: 'Price: Low', value: 'price_asc' },
              { label: 'Price: High', value: 'price_desc' },
            ].map((opt) => (
              <a
                key={opt.value}
                href={`/gallery?sort=${opt.value}${search ? `&q=${search}` : ''}`}
                className={`text-xs px-3 py-1.5 rounded-full transition-colors ${
                  sort === opt.value
                    ? 'bg-champagne text-charcoal font-semibold'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                {opt.label}
              </a>
            ))}
          </div>
        </div>
      </div>

      {/* Grid */}
      <LotGrid lots={galleryLots} isGallery />

      {galleryLots.length === 0 && (
        <div className="text-center py-20">
          <p className="font-display text-xl text-muted-foreground mb-2">No items in the gallery yet</p>
          <p className="text-sm text-muted-foreground">Check back soon — new pieces are added regularly.</p>
        </div>
      )}
    </div>
  );
}
