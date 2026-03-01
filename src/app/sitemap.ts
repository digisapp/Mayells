import type { MetadataRoute } from 'next';
import { db } from '@/db';
import { auctions, lots, categories } from '@/db/schema';
import { inArray, eq } from 'drizzle-orm';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://mayells.com';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = [
    { url: BASE_URL, lastModified: new Date(), changeFrequency: 'daily', priority: 1 },
    { url: `${BASE_URL}/auctions`, lastModified: new Date(), changeFrequency: 'hourly', priority: 0.9 },
    { url: `${BASE_URL}/lots`, lastModified: new Date(), changeFrequency: 'hourly', priority: 0.8 },
    { url: `${BASE_URL}/about`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
    { url: `${BASE_URL}/login`, changeFrequency: 'monthly', priority: 0.3 },
    { url: `${BASE_URL}/signup`, changeFrequency: 'monthly', priority: 0.3 },
  ];

  try {
    // Categories
    const cats = await db.select().from(categories).where(eq(categories.isActive, true));
    for (const cat of cats) {
      entries.push({
        url: `${BASE_URL}/categories/${cat.slug}`,
        changeFrequency: 'daily',
        priority: 0.7,
      });
    }

    // Active auctions
    const activeAuctions = await db
      .select()
      .from(auctions)
      .where(inArray(auctions.status, ['scheduled', 'preview', 'open', 'live', 'closed']));

    for (const auction of activeAuctions) {
      entries.push({
        url: `${BASE_URL}/auctions/${auction.slug}`,
        lastModified: auction.updatedAt ?? undefined,
        changeFrequency: 'hourly',
        priority: 0.8,
      });
    }

    // Active lots with slugs
    const activeLots = await db
      .select({ slug: lots.slug, updatedAt: lots.updatedAt })
      .from(lots)
      .where(inArray(lots.status, ['in_auction', 'sold']));

    for (const lot of activeLots) {
      if (lot.slug) {
        entries.push({
          url: `${BASE_URL}/lots/${lot.slug}`,
          lastModified: lot.updatedAt ?? undefined,
          changeFrequency: 'hourly',
          priority: 0.7,
        });
      }
    }
  } catch {
    // DB may not be available at build time
  }

  return entries;
}
