// ISR per category path; admin lot mutations revalidate on demand.
export const revalidate = 60;

import { cache } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { db } from '@/db';
import { lots, categories } from '@/db/schema';
import { eq, desc, and, inArray } from 'drizzle-orm';
import { bestAuctionSlugSql } from '@/lib/lots/auction-slug';
import { LotGrid } from '@/components/lots/LotGrid';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://mayells.com';

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

  const rows = await db
    .select({ lot: lots, auctionSlug: bestAuctionSlugSql })
    .from(lots)
    // Public listing — never expose draft / pending / withdrawn / unsold lots.
    .where(and(
      eq(lots.categoryId, category!.id),
      inArray(lots.status, ['for_sale', 'in_auction', 'sold']),
    ))
    .orderBy(desc(lots.createdAt))
    .limit(48);

  const categoryLots = rows.map(({ lot, auctionSlug }) => ({ ...lot, auctionSlug }));

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-12 sm:py-12">
      <div className="mb-6 sm:mb-10">
        <h1 className="font-display text-display-lg">{category!.name}</h1>
        {category!.description && (
          <p className="text-muted-foreground mt-2">{category!.description}</p>
        )}
      </div>
      {categoryLots.length > 0 ? (
        <LotGrid lots={categoryLots} />
      ) : (
        <div className="text-center py-16 sm:py-20 border border-border/60 rounded-2xl px-6">
          <p className="font-display text-display-sm">Nothing in {category!.name} right now</p>
          <p className="text-muted-foreground mt-2 max-w-sm mx-auto">
            New pieces are catalogued regularly. Browse our current sales or the gallery in the meantime.
          </p>
          <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/auctions" className="inline-flex items-center justify-center h-11 px-6 rounded-lg bg-champagne text-charcoal text-sm font-semibold hover:bg-champagne/90 transition-colors">
              View auctions
            </Link>
            <Link href="/gallery" className="inline-flex items-center justify-center h-11 px-6 rounded-lg border border-border text-sm font-medium hover:bg-secondary/50 transition-colors">
              Shop the gallery
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
