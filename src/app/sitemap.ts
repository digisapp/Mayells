import type { MetadataRoute } from 'next';
import { db } from '@/db';
import { auctions, lots, categories } from '@/db/schema';
import { inArray, eq, and } from 'drizzle-orm';
import { bestAuctionSlugSql } from '@/lib/lots/auction-slug';
import { PUBLIC_AUCTION_STATUSES } from '@/lib/auctions/visibility';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://mayells.com';

// Rebuilt hourly. Without this the sitemap is frozen at build time (where the
// DB may not even be reachable) and new sales never reach crawlers.
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = [
    { url: BASE_URL, lastModified: new Date(), changeFrequency: 'daily', priority: 1 },
    { url: `${BASE_URL}/auctions`, lastModified: new Date(), changeFrequency: 'hourly', priority: 0.9 },
    { url: `${BASE_URL}/gallery`, lastModified: new Date(), changeFrequency: 'hourly', priority: 0.9 },
    { url: `${BASE_URL}/lots`, lastModified: new Date(), changeFrequency: 'hourly', priority: 0.8 },
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

    // Public auctions (never draft or cancelled). 'completed' included —
    // settled auctions still have live, indexable result pages.
    const activeAuctions = await db
      .select({ slug: auctions.slug, updatedAt: auctions.updatedAt })
      .from(auctions)
      .where(inArray(auctions.status, [...PUBLIC_AUCTION_STATUSES]));

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

    // Auction lots at their canonical page in a public sale. `approved` lots
    // count once their sale is public: a preview catalogue, or a
    // LiveAuctioneers sale, whose lots stay approved while it runs. A lot with
    // no public sale has no page to list (/lots/{slug} is only a resolver that
    // redirects, and would 404 for it).
    const auctionLots = await db
      .select({ slug: lots.slug, updatedAt: lots.updatedAt, auctionSlug: bestAuctionSlugSql })
      .from(lots)
      .where(and(eq(lots.saleType, 'auction'), inArray(lots.status, ['approved', 'in_auction', 'sold'])));

    for (const lot of auctionLots) {
      if (lot.slug && lot.auctionSlug) {
        entries.push({
          url: `${BASE_URL}/auctions/${lot.auctionSlug}/lots/${lot.slug}`,
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
