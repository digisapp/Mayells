// ISR per category path; admin lot mutations revalidate on demand.
export const revalidate = 60;

import { cache } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { db } from '@/db';
import { lots, categories } from '@/db/schema';
import { eq, desc, and, inArray, sql } from 'drizzle-orm';
import { bestAuctionSlugSql } from '@/lib/lots/auction-slug';
import { LotGrid } from '@/components/lots/LotGrid';
import { Button } from '@/components/ui/button';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://mayells.com';

// ISR page, so no ?page=: the newest lots are shown with the true total, and
// the full lists live on each sale's page.
const LOT_LIMIT = 48;

// Deduplicated per request — generateMetadata and the page component share one DB call
const getCategory = cache(async (slug: string) => {
  const [category] = await db.select().from(categories).where(eq(categories.slug, slug)).limit(1);
  return category ?? null;
});

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const category = await getCategory(slug);
  if (!category) return { title: 'Category Not Found' };
  const description = category.description || `Browse ${category.name} lots at Mayells. Expert cataloging, authentication, and appraisal.`;
  return {
    title: category.name,
    description,
    alternates: { canonical: `${BASE_URL}/categories/${slug}` },
    openGraph: {
      title: `${category.name} | Mayells`,
      description,
      url: `${BASE_URL}/categories/${slug}`,
      type: 'website',
      images: [{ url: `${BASE_URL}/opengraph-image`, width: 1200, height: 630, alt: 'Mayells' }],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${category.name} | Mayells`,
      description,
    },
  };
}

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const category = await getCategory(slug);

  if (!category) notFound();

  // Public listing — never expose draft / pending / withdrawn / unsold lots.
  const visibleInCategory = and(
    eq(lots.categoryId, category!.id),
    inArray(lots.status, ['for_sale', 'in_auction', 'sold']),
  );
  const [rows, countRows] = await Promise.all([
    db
      .select({ lot: lots, auctionSlug: bestAuctionSlugSql })
      .from(lots)
      .where(visibleInCategory)
      .orderBy(desc(lots.createdAt))
      .limit(LOT_LIMIT),
    db
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(lots)
      .where(visibleInCategory),
  ]);

  const categoryLots = rows.map(({ lot, auctionSlug }) => ({ ...lot, auctionSlug }));
  const total = Math.max(countRows[0]?.count ?? 0, categoryLots.length);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-12 sm:py-12">
      <div className="mb-6 sm:mb-10">
        <h1 className="font-display text-display-lg">{category!.name}</h1>
        {category!.description && (
          <p className="text-muted-foreground mt-2">{category!.description}</p>
        )}
      </div>
      {categoryLots.length > 0 ? (
        <section aria-labelledby="category-lots-heading">
          <h2 id="category-lots-heading" className="sr-only">{category!.name} lots</h2>
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 mb-5 sm:mb-6">
            <p className="text-sm text-muted-foreground">
              {total > categoryLots.length ? <>Showing the newest {categoryLots.length} of {total}</> : total} lot
              {total !== 1 ? 's' : ''}
            </p>
            {total > categoryLots.length && (
              <Link
                href="/auctions"
                className="text-sm text-foreground underline underline-offset-4 decoration-border hover:decoration-foreground"
              >
                Browse every lot by sale
              </Link>
            )}
          </div>
          {/* Lots from several sales, so lot numbers would repeat. */}
          <LotGrid lots={categoryLots} showLotNumber={false} />
        </section>
      ) : (
        <div className="text-center py-16 sm:py-20 border border-border/60 rounded-2xl px-6">
          <p className="font-display text-display-sm">Nothing in {category!.name} right now</p>
          <p className="text-muted-foreground mt-2 max-w-sm mx-auto">
            New pieces are catalogued regularly. Browse our current sales or the gallery in the meantime.
          </p>
          <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
            <Button asChild variant="champagne" size="lg">
              <Link href="/auctions">View auctions</Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href="/gallery">Shop the gallery</Link>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
