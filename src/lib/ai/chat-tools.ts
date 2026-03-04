import { tool } from 'ai';
import { z } from 'zod';
import { db } from '@/db';
import { auctions, lots, categories, auctionLots } from '@/db/schema';
import { eq, and, gte, ilike, or, desc, asc, sql } from 'drizzle-orm';

function formatPrice(cents: number | null): string {
  if (!cents) return 'Price not available';
  return `$${(cents / 100).toLocaleString()}`;
}

export const chatTools = {
  getUpcomingAuctions: tool({
    description:
      'Get upcoming and currently open auctions. Use when someone asks about upcoming sales, auction schedule, or what auctions are happening.',
    inputSchema: z.object({
      category: z
        .string()
        .optional()
        .describe('Optional category filter like "jewelry", "art", "antiques"'),
    }),
    execute: async ({ category }) => {
      const results = await db
        .select({
          title: auctions.title,
          subtitle: auctions.subtitle,
          status: auctions.status,
          biddingStartsAt: auctions.biddingStartsAt,
          biddingEndsAt: auctions.biddingEndsAt,
          lotCount: auctions.lotCount,
          slug: auctions.slug,
        })
        .from(auctions)
        .where(
          or(
            eq(auctions.status, 'scheduled'),
            eq(auctions.status, 'preview'),
            eq(auctions.status, 'open'),
            eq(auctions.status, 'live'),
          ),
        )
        .orderBy(asc(auctions.biddingStartsAt))
        .limit(10);

      if (results.length === 0) {
        return { message: 'No upcoming auctions at the moment. Check back soon or contact us to be notified of future sales.' };
      }

      return {
        auctions: results.map((a) => ({
          title: a.title,
          subtitle: a.subtitle,
          status: a.status,
          starts: a.biddingStartsAt?.toLocaleDateString() ?? 'TBA',
          ends: a.biddingEndsAt?.toLocaleDateString() ?? 'TBA',
          lotCount: a.lotCount,
          url: `/auctions/${a.slug}`,
        })),
      };
    },
  }),

  searchLots: tool({
    description:
      'Search available lots by keyword, category, or price range. Use when someone asks about specific items, categories, or wants to browse inventory.',
    inputSchema: z.object({
      query: z
        .string()
        .optional()
        .describe('Search term like "rolex", "monet", "diamond ring"'),
      category: z
        .string()
        .optional()
        .describe('Category name like "Jewelry & Watches", "Art", "Antiques"'),
      maxPrice: z
        .number()
        .optional()
        .describe('Maximum price in dollars (not cents)'),
      saleType: z
        .enum(['auction', 'gallery', 'private'])
        .optional()
        .describe('Filter by sale type'),
    }),
    execute: async ({ query, category, maxPrice, saleType }) => {
      const conditions = [
        or(
          eq(lots.status, 'for_sale'),
          eq(lots.status, 'in_auction'),
          eq(lots.status, 'approved'),
        ),
      ];

      if (saleType) {
        conditions.push(eq(lots.saleType, saleType));
      }
      if (query) {
        conditions.push(
          or(
            ilike(lots.title, `%${query}%`),
            ilike(lots.description, `%${query}%`),
            ilike(lots.artist, `%${query}%`),
            ilike(lots.maker, `%${query}%`),
          )!,
        );
      }
      if (maxPrice) {
        conditions.push(gte(sql`${maxPrice * 100}`, lots.estimateLow));
      }

      const results = await db
        .select({
          title: lots.title,
          artist: lots.artist,
          maker: lots.maker,
          saleType: lots.saleType,
          estimateLow: lots.estimateLow,
          estimateHigh: lots.estimateHigh,
          buyNowPrice: lots.buyNowPrice,
          currentBid: lots.currentBidAmount,
          bidCount: lots.bidCount,
          categoryName: categories.name,
          slug: lots.slug,
        })
        .from(lots)
        .leftJoin(categories, eq(lots.categoryId, categories.id))
        .where(and(...conditions))
        .orderBy(desc(lots.isFeatured), desc(lots.createdAt))
        .limit(8);

      if (results.length === 0) {
        return { message: 'No items found matching your criteria. Try a broader search or contact us — we may have items arriving soon.' };
      }

      return {
        lots: results.map((l) => ({
          title: l.title,
          artist: l.artist || l.maker || undefined,
          category: l.categoryName,
          type: l.saleType,
          estimate: l.estimateLow
            ? `${formatPrice(l.estimateLow)} - ${formatPrice(l.estimateHigh)}`
            : undefined,
          buyNowPrice:
            l.saleType === 'gallery' ? formatPrice(l.buyNowPrice) : undefined,
          currentBid:
            l.saleType === 'auction' && l.currentBid
              ? formatPrice(l.currentBid)
              : undefined,
          bids: l.bidCount || undefined,
          url: l.saleType === 'private' ? `/private-sales/${l.slug}` : `/lots/${l.slug}`,
        })),
      };
    },
  }),

  getGalleryItems: tool({
    description:
      'Get items available for immediate purchase in the gallery (Buy Now). Use when someone wants to buy something right away.',
    inputSchema: z.object({
      category: z
        .string()
        .optional()
        .describe('Optional category filter'),
      limit: z.number().optional().default(6).describe('Number of items to return'),
    }),
    execute: async ({ category, limit }) => {
      const conditions = [
        eq(lots.saleType, 'gallery'),
        eq(lots.status, 'for_sale'),
      ];

      const results = await db
        .select({
          title: lots.title,
          artist: lots.artist,
          maker: lots.maker,
          buyNowPrice: lots.buyNowPrice,
          categoryName: categories.name,
          slug: lots.slug,
        })
        .from(lots)
        .leftJoin(categories, eq(lots.categoryId, categories.id))
        .where(and(...conditions))
        .orderBy(desc(lots.isFeatured), desc(lots.createdAt))
        .limit(limit);

      if (results.length === 0) {
        return { message: 'No gallery items available right now. Check our auctions for current lots.' };
      }

      return {
        items: results.map((l) => ({
          title: l.title,
          artist: l.artist || l.maker || undefined,
          category: l.categoryName,
          price: formatPrice(l.buyNowPrice),
          url: `/lots/${l.slug}`,
        })),
      };
    },
  }),

  getCategories: tool({
    description:
      'Get all available auction categories. Use when someone asks what types of items you deal in.',
    inputSchema: z.object({}),
    execute: async () => {
      const results = await db
        .select({
          name: categories.name,
          description: categories.description,
          lotCount: categories.lotCount,
          slug: categories.slug,
        })
        .from(categories)
        .where(eq(categories.isActive, true))
        .orderBy(asc(categories.sortOrder));

      return {
        categories: results.map((c) => ({
          name: c.name,
          description: c.description,
          items: c.lotCount,
        })),
      };
    },
  }),

  getRecentSoldItems: tool({
    description:
      'Get recently sold items with hammer prices. Use when someone asks about past results, price history, or what items have sold for.',
    inputSchema: z.object({
      category: z
        .string()
        .optional()
        .describe('Optional category filter'),
    }),
    execute: async ({ category }) => {
      const results = await db
        .select({
          title: lots.title,
          artist: lots.artist,
          maker: lots.maker,
          hammerPrice: lots.hammerPrice,
          estimateLow: lots.estimateLow,
          estimateHigh: lots.estimateHigh,
          categoryName: categories.name,
        })
        .from(lots)
        .leftJoin(categories, eq(lots.categoryId, categories.id))
        .where(eq(lots.status, 'sold'))
        .orderBy(desc(lots.updatedAt))
        .limit(8);

      if (results.length === 0) {
        return { message: 'No recent sales data available yet.' };
      }

      return {
        recentSales: results.map((l) => ({
          title: l.title,
          artist: l.artist || l.maker || undefined,
          category: l.categoryName,
          soldFor: formatPrice(l.hammerPrice),
          estimate: l.estimateLow
            ? `${formatPrice(l.estimateLow)} - ${formatPrice(l.estimateHigh)}`
            : undefined,
        })),
      };
    },
  }),
};
