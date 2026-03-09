export const dynamic = 'force-dynamic';

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { db } from '@/db';
import { lots, categories } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';
import { LotGrid } from '@/components/lots/LotGrid';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const [category] = await db.select().from(categories).where(eq(categories.slug, slug)).limit(1);
  if (!category) return { title: 'Category Not Found' };
  return {
    title: category.name,
    description: category.description || `Browse ${category.name} lots at Mayell Auctions. Expert cataloging, authentication, and appraisal.`,
  };
}

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const [category] = await db
    .select()
    .from(categories)
    .where(eq(categories.slug, slug))
    .limit(1);

  if (!category) notFound();

  const categoryLots = await db
    .select()
    .from(lots)
    .where(eq(lots.categoryId, category.id))
    .orderBy(desc(lots.createdAt))
    .limit(48);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="mb-10">
        <h1 className="font-display text-display-lg">{category.name}</h1>
        {category.description && (
          <p className="text-muted-foreground mt-2">{category.description}</p>
        )}
      </div>
      <LotGrid lots={categoryLots} />
    </div>
  );
}
