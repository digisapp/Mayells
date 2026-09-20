import { db } from '@/db';
import { auctions, categories, lots } from '@/db/schema';
import { and, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import { publicLotPath } from '@/lib/lots/urls';
import type { Microsite } from './config';

export interface ShowcaseLot {
  id: string;
  title: string;
  artist: string | null;
  maker: string | null;
  period: string | null;
  /** Hammer price when sold, otherwise null. Cents. */
  hammerPrice: number | null;
  estimateLow: number | null;
  estimateHigh: number | null;
  primaryImageUrl: string | null;
  categoryName: string | null;
  categorySlug: string | null;
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
  /**
   * What the page shows as proof.
   *
   * 'realized' is strictly better — our own hammer prices against our own
   * estimates. Until lots actually sell there are none, and an auction page
   * with no pictures converts badly, so we fall back to the live catalogue
   * and label it honestly as current rather than sold. Never fabricated.
   */
  showcase: { mode: 'realized' | 'current' | 'none'; lots: ShowcaseLot[] };
  upcoming: UpcomingAuction[];
  soldCount: number;
  soldTotal: number;
  /** Lots currently catalogued in this city's lead categories. */
  currentCount: number;
  degraded: boolean;
}

const EMPTY: MicrositeData = {
  showcase: { mode: 'none', lots: [] },
  upcoming: [],
  soldCount: 0,
  soldTotal: 0,
  currentCount: 0,
  degraded: true,
};

const SELECT = {
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
  categorySlug: categories.slug,
} as const;

/**
 * Round-robin rows across their category, visiting categories in the order
 * this city actually leads with.
 *
 * Two jobs. It stops the single highest-value category from filling the rail
 * (sorted purely by estimate, Delray showed four diamond rings and none of
 * the furniture or pictures its page is about). And because each city
 * declares its own `leadCategories` order, the same catalogue surfaces in a
 * different order per site — Winter Park opens on design, West Palm on
 * jewelry — which is the most differentiation available while the shared
 * catalogue is this small.
 */
function interleaveByCategory<T extends { categorySlug: string | null }>(
  rows: T[],
  priority: string[],
  take: number,
): T[] {
  const buckets = new Map<string, T[]>();
  for (const r of rows) {
    const k = r.categorySlug ?? '—';
    const b = buckets.get(k);
    if (b) b.push(r);
    else buckets.set(k, [r]);
  }
  const ordered = [
    ...priority.filter((p) => buckets.has(p)),
    ...[...buckets.keys()].filter((k) => !priority.includes(k)),
  ];
  const queues = ordered.map((k) => buckets.get(k)!);
  const out: T[] = [];
  let moved = true;
  while (out.length < take && moved) {
    moved = false;
    for (const q of queues) {
      if (out.length >= take) break;
      const next = q.shift();
      if (next) { out.push(next); moved = true; }
    }
  }
  return out;
}

function toShowcase(rows: Array<Record<string, unknown>>): ShowcaseLot[] {
  return rows.map((r) => ({
    id: r.id as string,
    title: r.title as string,
    artist: (r.artist ?? null) as string | null,
    maker: (r.maker ?? null) as string | null,
    period: (r.period ?? null) as string | null,
    hammerPrice: (r.hammerPrice ?? null) as number | null,
    estimateLow: (r.estimateLow ?? null) as number | null,
    estimateHigh: (r.estimateHigh ?? null) as number | null,
    primaryImageUrl: (r.primaryImageUrl ?? null) as string | null,
    categoryName: (r.categoryName ?? null) as string | null,
    categorySlug: (r.categorySlug ?? null) as string | null,
    href: publicLotPath({
      slug: r.slug as string | null,
      id: r.id as string,
      saleType: r.saleType as string,
    }),
  }));
}

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

    // Publicly-visible catalogue in this city's categories. Requires an image:
    // a proof rail with a grey placeholder in it is worse than a shorter rail.
    const currentInCategories = and(
      inArray(lots.status, ['in_auction', 'for_sale']),
      isNotNull(lots.primaryImageUrl),
      inArray(lots.categoryId, categoryIds),
    );

    const [soldRows, currentRows, upcomingRows, soldStats, currentStats] = await Promise.all([
      db.select(SELECT).from(lots)
        .leftJoin(categories, eq(lots.categoryId, categories.id))
        .where(soldInCategories).orderBy(desc(lots.hammerPrice)).limit(8),

      db.select(SELECT).from(lots)
        .leftJoin(categories, eq(lots.categoryId, categories.id))
        .where(currentInCategories).orderBy(desc(lots.estimateHigh)).limit(24),

      db.select({
        id: auctions.id,
        title: auctions.title,
        slug: auctions.slug,
        status: auctions.status,
        biddingEndsAt: auctions.biddingEndsAt,
        previewStartsAt: auctions.previewStartsAt,
      }).from(auctions)
        .where(inArray(auctions.status, ['live', 'open', 'scheduled', 'preview']))
        .orderBy(desc(auctions.createdAt)).limit(3),

      db.select({
        count: sql<number>`count(*)`.mapWith(Number),
        total: sql<number>`coalesce(sum(${lots.hammerPrice}), 0)`.mapWith(Number),
      }).from(lots).where(soldInCategories),

      db.select({ count: sql<number>`count(*)`.mapWith(Number) })
        .from(lots).where(currentInCategories),
    ]);

    const showcase: MicrositeData['showcase'] =
      soldRows.length > 0
        ? { mode: 'realized', lots: toShowcase(soldRows) }
        : currentRows.length > 0
          ? {
              mode: 'current',
              lots: interleaveByCategory(toShowcase(currentRows), site.leadCategories, 8),
            }
          : { mode: 'none', lots: [] };

    return {
      showcase,
      upcoming: upcomingRows,
      soldCount: soldStats[0]?.count ?? 0,
      soldTotal: soldStats[0]?.total ?? 0,
      currentCount: currentStats[0]?.count ?? 0,
      degraded: false,
    };
  } catch {
    return EMPTY;
  }
}
