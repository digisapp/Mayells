import { db } from '@/db';
import { auctions, categories, lots } from '@/db/schema';
import { and, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import { publicLotPath } from '@/lib/lots/urls';
import type { Microsite } from './config';

export interface RealizedLot {
  id: string;
  title: string;
  artist: string | null;
  maker: string | null;
  period: string | null;
  hammerPrice: number;
  estimateLow: number | null;
  estimateHigh: number | null;
  primaryImageUrl: string | null;
  categoryName: string | null;
  href: string;
}

export interface UpcomingAuction {
  id: string;
  title: string;
  slug: string;
  status: string;
  biddingEndsAt: Date | null;
  previewStartsAt: Date | null;
}

export interface MicrositeData {
  realized: RealizedLot[];
  upcoming: UpcomingAuction[];
  /** Total sold lots across the categories this city leads with. */
  soldCount: number;
  /** Sum of hammer prices for those lots, in cents. */
  soldTotal: number;
  /** True when the live database could not be reached at render time. */
  degraded: boolean;
}

const EMPTY: MicrositeData = {
  realized: [],
  upcoming: [],
  soldCount: 0,
  soldTotal: 0,
  degraded: true,
};

/**
 * Live data for a microsite, scoped to the categories that city leads with.
 *
 * Everything here is real: sold lots come from our own hammer prices, not a
 * hand-written list. If the query fails or there is nothing sold yet in these
 * categories, the caller renders the section away rather than substituting
 * illustrative numbers — a fabricated result on a consignment pitch is both a
 * trust problem and, for a page making price claims, a legal one.
 */
export async function getMicrositeData(site: Microsite): Promise<MicrositeData> {
  try {
    const categoryIds = db
      .select({ id: categories.id })
      .from(categories)
      .where(inArray(categories.slug, site.leadCategories));

    const soldInCategories = and(
      eq(lots.status, 'sold'),
      isNotNull(lots.hammerPrice),
      sql`${lots.hammerPrice} > 0`,
      inArray(lots.categoryId, categoryIds),
    );

    const [realizedRows, upcomingRows, statsRows] = await Promise.all([
      db
        .select({
          id: lots.id,
          title: lots.title,
          artist: lots.artist,
          maker: lots.maker,
          period: lots.period,
          hammerPrice: lots.hammerPrice,
          estimateLow: lots.estimateLow,
          estimateHigh: lots.estimateHigh,
          primaryImageUrl: lots.primaryImageUrl,
          slug: lots.slug,
          saleType: lots.saleType,
          categoryName: categories.name,
        })
        .from(lots)
        .leftJoin(categories, eq(lots.categoryId, categories.id))
        .where(soldInCategories)
        .orderBy(desc(lots.hammerPrice))
        .limit(8),

      db
        .select({
          id: auctions.id,
          title: auctions.title,
          slug: auctions.slug,
          status: auctions.status,
          biddingEndsAt: auctions.biddingEndsAt,
          previewStartsAt: auctions.previewStartsAt,
        })
        .from(auctions)
        .where(inArray(auctions.status, ['live', 'open', 'scheduled', 'preview']))
        .orderBy(desc(auctions.createdAt))
        .limit(3),

      db
        .select({
          count: sql<number>`count(*)`.mapWith(Number),
          total: sql<number>`coalesce(sum(${lots.hammerPrice}), 0)`.mapWith(Number),
        })
        .from(lots)
        .where(soldInCategories),
    ]);

    return {
      realized: realizedRows.map((row) => ({
        id: row.id,
        title: row.title,
        artist: row.artist,
        maker: row.maker,
        period: row.period,
        hammerPrice: row.hammerPrice as number,
        estimateLow: row.estimateLow,
        estimateHigh: row.estimateHigh,
        primaryImageUrl: row.primaryImageUrl,
        categoryName: row.categoryName,
        href: publicLotPath({ slug: row.slug, id: row.id, saleType: row.saleType }),
      })),
      upcoming: upcomingRows,
      soldCount: statsRows[0]?.count ?? 0,
      soldTotal: statsRows[0]?.total ?? 0,
      degraded: false,
    };
  } catch {
    // Marketing pages must render even if the database is unreachable — the
    // consignment form posts to an API route and keeps working regardless.
    return EMPTY;
  }
}
