import type { MetadataRoute } from 'next';
import { db } from '@/db';
import { auctions, lots, categories } from '@/db/schema';
import { inArray, eq, and } from 'drizzle-orm';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://mayellauctions.com';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = [
    { url: BASE_URL, lastModified: new Date(), changeFrequency: 'daily', priority: 1 },
    { url: `${BASE_URL}/auctions`, lastModified: new Date(), changeFrequency: 'hourly', priority: 0.9 },
    { url: `${BASE_URL}/gallery`, lastModified: new Date(), changeFrequency: 'hourly', priority: 0.9 },
    { url: `${BASE_URL}/lots`, lastModified: new Date(), changeFrequency: 'hourly', priority: 0.8 },
    { url: `${BASE_URL}/search`, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${BASE_URL}/consign`, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${BASE_URL}/how-to-buy`, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE_URL}/about`, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${BASE_URL}/consignment-agreement`, changeFrequency: 'monthly', priority: 0.4 },
    { url: `${BASE_URL}/terms`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${BASE_URL}/privacy`, changeFrequency: 'yearly', priority: 0.3 },
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

    // Gallery items (for_sale with gallery/private saleType)
    const galleryLots = await db
      .select({ slug: lots.slug, id: lots.id, updatedAt: lots.updatedAt })
      .from(lots)
      .where(and(
        inArray(lots.saleType, ['gallery', 'private']),
        eq(lots.status, 'for_sale'),
      ));

    for (const lot of galleryLots) {
      entries.push({
        url: `${BASE_URL}/gallery/${lot.slug || lot.id}`,
        lastModified: lot.updatedAt ?? undefined,
        changeFrequency: 'daily',
        priority: 0.7,
      });
    }

    // Auction lots (in_auction or sold)
    const auctionLots = await db
      .select({ slug: lots.slug, updatedAt: lots.updatedAt })
      .from(lots)
      .where(inArray(lots.status, ['in_auction', 'sold']));

    for (const lot of auctionLots) {
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
