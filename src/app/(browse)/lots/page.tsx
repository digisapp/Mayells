// ISR: cacheable at the CDN; bid activity and admin lot mutations revalidate
// on demand. Department filter and sort run on the client over these rows.
export const revalidate = 60;

import { db } from '@/db';
import { categories, lots } from '@/db/schema';
import { desc, eq, sql } from 'drizzle-orm';
import { bestAuctionSlugSql } from '@/lib/lots/auction-slug';
import { LotBrowser } from '@/components/lots/LotBrowser';
import type { BrowseLot } from '@/components/lots/lot-browser';

export const metadata = {
  title: 'Browse Lots',
  description: 'Browse auction lots at Mayells. Paintings, sculptures, antique furniture, jewelry, watches, designer fashion, and collectibles with expert cataloging.',
  openGraph: {
    title: 'Browse Lots | Mayells',
    description: 'Browse auction lots — paintings, sculptures, antique furniture, jewelry, watches, and collectibles.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Browse Lots | Mayells',
    description: 'Browse auction lots — paintings, sculptures, antique furniture, jewelry, watches, and collectibles.',
  },
};

/**
 * When the lot's most relevant sale (same ranking as bestAuctionSlugSql)
 * closes it — the per-lot staggered close, else the sale's end — as epoch ms.
 * Null once that moment has passed (as of the ISR render), so "Closing
 * soonest" never leads with lots that are only awaiting settlement.
 */
const closesAtMsSql = sql<number | null>`(
  SELECT CASE WHEN coalesce(al.closing_at, a.bidding_ends_at) > now()
    THEN extract(epoch from coalesce(al.closing_at, a.bidding_ends_at)) * 1000 END
  FROM auction_lots al
  JOIN auctions a ON a.id = al.auction_id
  WHERE al.lot_id = "lots"."id"
  ORDER BY CASE a.status
    WHEN 'live' THEN 0
    WHEN 'open' THEN 0
    WHEN 'preview' THEN 1
    WHEN 'scheduled' THEN 1
    WHEN 'closing' THEN 2
    WHEN 'closed' THEN 2
    ELSE 3 END,
    a.bidding_ends_at DESC NULLS LAST
  LIMIT 1
)`;

export default async function LotsPage() {
  // Only the fields a card renders (plus what the filter/sort needs): this
  // list is serialized to the client component, so no confidential columns.
  const rows = await db
    .select({
      id: lots.id,
      slug: lots.slug,
      title: lots.title,
      artist: lots.artist,
      lotNumber: lots.lotNumber,
      primaryImageUrl: lots.primaryImageUrl,
      isFeatured: lots.isFeatured,
      saleType: lots.saleType,
      status: lots.status,
      buyNowPrice: lots.buyNowPrice,
      estimateLow: lots.estimateLow,
      estimateHigh: lots.estimateHigh,
      currentBidAmount: lots.currentBidAmount,
      bidCount: lots.bidCount,
      createdAt: lots.createdAt,
      auctionSlug: bestAuctionSlugSql,
      closesAtMs: closesAtMsSql.mapWith(Number).as('closes_at_ms'),
      categoryName: categories.name,
      categorySlug: categories.slug,
      categorySortOrder: categories.sortOrder,
    })
    .from(lots)
    .innerJoin(categories, eq(lots.categoryId, categories.id))
    .where(eq(lots.status, 'in_auction'))
    .orderBy(desc(lots.createdAt))
    .limit(48);

  const browseLots: BrowseLot[] = rows.map(({ createdAt, closesAtMs, ...lot }) => ({
    ...lot,
    createdAtMs: createdAt ? createdAt.getTime() : 0,
    closesAtMs: closesAtMs ?? null,
  }));

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-12 sm:py-12">
      <h1 className="font-display text-display-lg mb-4 sm:mb-8">Browse Lots</h1>
      <LotBrowser lots={browseLots} />
    </div>
  );
}
