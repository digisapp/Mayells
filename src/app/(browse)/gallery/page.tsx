export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { db } from '@/db';
import { lots, categories } from '@/db/schema';
import { eq, and, desc, asc, ilike, inArray } from 'drizzle-orm';
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
    conditions.push(
      inArray(lots.categoryId, db.select({ id: categories.id }).from(categories).where(eq(categories.slug, categorySlug))),
    );
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
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-12 sm:py-12">
      {/* Header */}
      <div className="text-center mb-8 sm:mb-12">
        <h1 className="font-display text-display-lg mb-3">Gallery</h1>
        <p className="text-muted-foreground max-w-xl mx-auto">
          Curated luxury pieces available for immediate purchase. No bidding — just find what you love and buy it.
        </p>
      </div>

      {/* Sort controls */}
      {galleryLots.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 mb-6 sm:mb-8">
          <p className="text-sm text-muted-foreground">
            {galleryLots.length} item{galleryLots.length !== 1 ? 's' : ''}
          </p>
          <nav aria-label="Sort gallery" className="flex items-center gap-2">
            <span className="hidden sm:inline text-sm text-muted-foreground">Sort by:</span>
            <div className="flex gap-1.5">
              {[
                { label: 'Newest', value: 'newest' },
                { label: 'Price: Low', value: 'price_asc' },
                { label: 'Price: High', value: 'price_desc' },
              ].map((opt) => (
                <Link
                  key={opt.value}
                  href={`/gallery?sort=${opt.value}${search ? `&q=${encodeURIComponent(search)}` : ''}${categorySlug ? `&category=${encodeURIComponent(categorySlug)}` : ''}`}
                  scroll={false}
                  aria-current={sort === opt.value ? 'true' : undefined}
                  className={`inline-flex items-center h-10 sm:h-9 text-[13px] sm:text-xs px-3.5 sm:px-3 rounded-full transition-colors ${
                    sort === opt.value
                      ? 'bg-champagne text-charcoal font-semibold'
                      : 'bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground'
                  }`}
                >
                  {opt.label}
                </Link>
              ))}
            </div>
          </nav>
        </div>
      )}

      {/* Grid */}
      {galleryLots.length > 0 ? (
        <LotGrid lots={galleryLots} isGallery />
      ) : (
        <div className="text-center py-16 sm:py-20 border border-border/60 rounded-2xl">
          <p className="font-display text-xl mb-2">
            {search || categorySlug ? 'Nothing matches that search' : 'No items in the gallery yet'}
          </p>
          <p className="text-sm text-muted-foreground">
            {search || categorySlug ? 'Try the full gallery instead.' : 'Check back soon — new pieces are added regularly.'}
          </p>
          {(search || categorySlug) && (
            <Link href="/gallery" className="mt-6 inline-flex items-center h-11 px-6 rounded-lg border border-border text-sm font-medium hover:bg-secondary/50 transition-colors">
              View the full gallery
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
