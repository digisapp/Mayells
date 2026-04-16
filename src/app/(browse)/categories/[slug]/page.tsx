export const dynamic = 'force-dynamic';

import { cache } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { db } from '@/db';
import { lots, categories } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';
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

  const categoryLots = await db
    .select()
    .from(lots)
    .where(eq(lots.categoryId, category!.id))
    .orderBy(desc(lots.createdAt))
    .limit(48);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="mb-10">
        <h1 className="font-display text-display-lg">{category!.name}</h1>
        {category!.description && (
          <p className="text-muted-foreground mt-2">{category!.description}</p>
        )}
      </div>
      <LotGrid lots={categoryLots} />
    </div>
  );
}
