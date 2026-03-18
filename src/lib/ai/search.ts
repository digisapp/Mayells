import { generateObject } from 'ai';
import { z } from 'zod';
import { getModel } from './client';
import { db } from '@/db';
import { lots, categories } from '@/db/schema';
import { sql, and, eq, gte, lte, ilike, or, inArray, desc } from 'drizzle-orm';

const searchIntentSchema = z.object({
  keywords: z.array(z.string()).describe('Search keywords extracted from query'),
  category: z.enum(['art', 'antiques', 'luxury', 'fashion', 'jewelry', 'design']).optional().describe('Category filter if mentioned'),
  minPrice: z.number().int().optional().describe('Minimum price in USD cents if mentioned'),
  maxPrice: z.number().int().optional().describe('Maximum price in USD cents if mentioned'),
  artist: z.string().optional().describe('Artist or maker name if mentioned'),
  period: z.string().optional().describe('Art period or era if mentioned'),
  medium: z.string().optional().describe('Material or medium if mentioned'),
  sortBy: z.enum(['relevance', 'price_low', 'price_high', 'newest', 'ending_soon']).default('relevance'),
});

export type SearchIntent = z.infer<typeof searchIntentSchema>;

/**
 * Parse a natural language search query into structured search parameters.
 */
export async function parseSearchQuery(query: string): Promise<SearchIntent> {
  const { object } = await generateObject({
    model: getModel('fast'),
    schema: searchIntentSchema,
    prompt: `Parse this auction search query into structured filters. Convert any mentioned dollar amounts to cents (multiply by 100).

Query: "${query}"

Examples:
- "art deco jewelry under $5000" → category: jewelry, keywords: ["art deco"], maxPrice: 500000
- "Picasso prints" → artist: "Picasso", keywords: ["prints"], category: art
- "mid century modern furniture" → period: "Mid-Century Modern", keywords: ["furniture"], category: design
- "vintage Chanel bags" → keywords: ["vintage", "Chanel", "bags"], category: fashion`,
  });

  return object;
}

/**
 * Execute an AI-powered search against the lots database.
 */
export async function aiSearch(query: string, limit = 24) {
  const intent = await parseSearchQuery(query);

  const conditions = [];

  // Only show active lots
  conditions.push(inArray(lots.status, ['in_auction', 'approved']));

  // Category filter
  if (intent.category) {
    const [cat] = await db
      .select()
      .from(categories)
      .where(eq(categories.slug, intent.category))
      .limit(1);
    if (cat) {
      conditions.push(eq(lots.categoryId, cat.id));
    }
  }

  // Price filters
  if (intent.minPrice) {
    conditions.push(gte(lots.estimateLow, intent.minPrice));
  }
  if (intent.maxPrice) {
    conditions.push(lte(lots.estimateHigh, intent.maxPrice));
  }

  // Artist filter
  if (intent.artist) {
    conditions.push(ilike(lots.artist, `%${intent.artist}%`));
  }

  // Period filter
  if (intent.period) {
    conditions.push(ilike(lots.period, `%${intent.period}%`));
  }

  // Medium filter
  if (intent.medium) {
    conditions.push(ilike(lots.medium, `%${intent.medium}%`));
  }

  // Keyword search across title, description, tags
  if (intent.keywords.length > 0) {
    const keywordConditions = intent.keywords.map((kw) =>
      or(
        ilike(lots.title, `%${kw}%`),
        ilike(lots.description, `%${kw}%`),
        ilike(lots.artist, `%${kw}%`),
        ilike(lots.medium, `%${kw}%`),
      ),
    );
    conditions.push(or(...keywordConditions)!);
  }

  // Sort
  let orderBy;
  switch (intent.sortBy) {
    case 'price_low':
      orderBy = lots.currentBidAmount;
      break;
    case 'price_high':
      orderBy = desc(lots.currentBidAmount);
      break;
    case 'newest':
      orderBy = desc(lots.createdAt);
      break;
    default:
      orderBy = desc(lots.bidCount);
  }

  const results = await db
    .select()
    .from(lots)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(orderBy)
    .limit(limit);

  return { results, intent };
}
