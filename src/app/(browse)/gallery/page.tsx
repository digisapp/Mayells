export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { db } from '@/db';
import { lots, categories } from '@/db/schema';
import { eq, and, desc, asc, ilike, inArray, sql } from 'drizzle-orm';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { LotGrid } from '@/components/lots/LotGrid';
import { Button } from '@/components/ui/button';

const PAGE_SIZE = 48;

const SORT_OPTIONS = [
  { label: 'Newest', value: 'newest' },
  { label: 'Price: Low', value: 'price_asc' },
  { label: 'Price: High', value: 'price_desc' },
];
const DEFAULT_SORT = 'newest';

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
  const sort = SORT_OPTIONS.some((o) => o.value === params.sort) ? params.sort! : DEFAULT_SORT;
  const search = params.q;
  const categorySlug = params.category;
  // ?page= is 1-based; junk or out-of-range values are redirected below.
  const requestedPage = Math.max(1, Math.trunc(Number(params.page)) || 1);

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

  // No try/catch: a failed query should reach the error boundary, not
  // masquerade as an empty gallery.
  const [countRow] = await db
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(lots)
    .where(and(...conditions));
  const total = countRow?.count ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(requestedPage, pageCount);

  // Links keep the current sort and filters. Defaults (newest, page 1) are
  // left out, so each view has exactly one URL.
  const hrefFor = (next: { sort?: string; page?: number }) => {
    const qs = new URLSearchParams();
    const nextSort = next.sort ?? sort;
    if (nextSort !== DEFAULT_SORT) qs.set('sort', nextSort);
    if (search) qs.set('q', search);
    if (categorySlug) qs.set('category', categorySlug);
    if (next.page && next.page > 1) qs.set('page', String(next.page));
    const query = qs.toString();
    return query ? `/gallery?${query}` : '/gallery';
  };

  // A page past the end (the gallery shrank since the link was made) or a
  // junk ?page= goes to the real page's own URL rather than rendering it
  // under a wrong one.
  if (params.page !== undefined && params.page !== (page > 1 ? String(page) : undefined)) {
    redirect(hrefFor({ page }));
  }

  const galleryLots = total > 0
    ? await db
        .select()
        .from(lots)
        .where(and(...conditions))
        // id breaks ties so a page boundary never repeats or skips an item.
        .orderBy(orderBy, asc(lots.id))
        .limit(PAGE_SIZE)
        .offset((page - 1) * PAGE_SIZE)
    : [];

  const firstShown = (page - 1) * PAGE_SIZE + 1;
  const lastShown = firstShown + galleryLots.length - 1;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-12 sm:py-12">
      {/* Header */}
      <div className="text-center mb-8 sm:mb-12">
        <h1 className="font-display text-display-lg mb-3">Gallery</h1>
        <p className="text-muted-foreground max-w-xl mx-auto">
          Curated pieces at a fixed price. Inquire about any work and a specialist will arrange the purchase.
        </p>
      </div>

      {/* Sort controls */}
      {galleryLots.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 mb-6 sm:mb-8">
          <p className="text-sm text-muted-foreground">
            {pageCount > 1 ? <>{firstShown}&ndash;{lastShown} of {total}</> : total} item{total !== 1 ? 's' : ''}
          </p>
          <nav aria-label="Sort gallery" className="flex items-center gap-2">
            <span className="hidden sm:inline text-sm text-muted-foreground">Sort by:</span>
            <div className="flex gap-1.5">
              {SORT_OPTIONS.map((opt) => (
                <Link
                  key={opt.value}
                  href={hrefFor({ sort: opt.value })}
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
        <section aria-labelledby="gallery-works-heading">
          <h2 id="gallery-works-heading" className="sr-only">Available works</h2>
          <LotGrid lots={galleryLots} isGallery showLotNumber={false} />
          {pageCount > 1 && (
            // Centred, with the unavailable direction shown disabled so the
            // controls don't jump between the first, middle and last pages.
            <nav aria-label="Gallery pages" className="mt-10 sm:mt-12 flex items-center justify-center gap-3 sm:gap-6">
              {page > 1 ? (
                <Button asChild variant="outline" size="lg">
                  <Link href={hrefFor({ page: page - 1 })} rel="prev">
                    <ChevronLeft className="h-4 w-4" aria-hidden />
                    Previous
                  </Link>
                </Button>
              ) : (
                <Button variant="outline" size="lg" disabled>
                  <ChevronLeft className="h-4 w-4" aria-hidden />
                  Previous
                </Button>
              )}
              <p className="text-sm text-muted-foreground tabular-nums whitespace-nowrap">
                Page {page} of {pageCount}
              </p>
              {page < pageCount ? (
                <Button asChild variant="outline" size="lg">
                  <Link href={hrefFor({ page: page + 1 })} rel="next">
                    Next
                    <ChevronRight className="h-4 w-4" aria-hidden />
                  </Link>
                </Button>
              ) : (
                <Button variant="outline" size="lg" disabled>
                  Next
                  <ChevronRight className="h-4 w-4" aria-hidden />
                </Button>
              )}
            </nav>
          )}
        </section>
      ) : (
        <div className="text-center py-16 sm:py-20 border border-border/60 rounded-2xl px-6">
          <p className="font-display text-display-sm">
            {search || categorySlug ? 'Nothing matches that search' : 'No pieces in the gallery right now'}
          </p>
          <p className="text-muted-foreground mt-2 max-w-sm mx-auto">
            {search || categorySlug
              ? 'Try the full gallery instead.'
              : 'New pieces are added regularly. In the meantime, browse our current sales.'}
          </p>
          <Button asChild variant="outline" size="lg" className="mt-6">
            {search || categorySlug ? (
              <Link href="/gallery">View the full gallery</Link>
            ) : (
              <Link href="/auctions">View auctions</Link>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
