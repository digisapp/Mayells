import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { db } from '@/db';
import { savedSearches, lots, users } from '@/db/schema';
import { eq, and, gt, inArray, sql, asc, type SQL } from 'drizzle-orm';
import { sendSavedSearchAlert } from '@/lib/email/notifications';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const CRON_SECRET = process.env.CRON_SECRET;
const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://mayells.com';

// Caps so one run stays well inside the function timeout even if the table
// grows; anything not covered this hour is picked up on the next run because
// the watermark only advances after a successful send.
const MAX_SEARCHES_PER_RUN = 200;
const MAX_EMAILS_PER_RUN = 50;
const MAX_LOTS_PER_EMAIL = 6;

function isAuthorized(request: NextRequest): boolean {
  if (!CRON_SECRET) return false;
  const authHeader = request.headers.get('authorization') ?? '';
  const expected = Buffer.from(`Bearer ${CRON_SECRET}`);
  const provided = Buffer.from(authHeader);
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

// Escape ILIKE wildcards so a query like "100%" matches literally.
function escapeLike(word: string): string {
  return word.replace(/[\\%_]/g, (m) => `\\${m}`);
}

function lotUrl(lot: { slug: string | null; id: string; saleType: string }): string {
  const ref = lot.slug || lot.id;
  return lot.saleType === 'gallery' || lot.saleType === 'private'
    ? `${BASE_URL}/gallery/${ref}`
    : `${BASE_URL}/lots/${ref}`;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const searches = await db
      .select({
        id: savedSearches.id,
        query: savedSearches.query,
        categoryId: savedSearches.categoryId,
        lastNotifiedAt: savedSearches.lastNotifiedAt,
        email: users.email,
      })
      .from(savedSearches)
      .innerJoin(users, eq(users.id, savedSearches.userId))
      .where(eq(users.emailNotifications, true))
      .orderBy(asc(savedSearches.lastNotifiedAt))
      .limit(MAX_SEARCHES_PER_RUN);

    let emailsSent = 0;
    let searchesMatched = 0;

    for (const search of searches) {
      if (emailsSent >= MAX_EMAILS_PER_RUN) break;

      const words = search.query
        .split(/\s+/)
        .map((w) => w.trim())
        .filter((w) => w.length >= 2)
        .slice(0, 8);

      // A search must constrain on something; skip degenerate rows.
      if (words.length === 0 && !search.categoryId) continue;

      const haystack = sql`(${lots.title} || ' ' || coalesce(${lots.subtitle}, '') || ' ' || coalesce(${lots.artist}, '') || ' ' || coalesce(${lots.maker}, '') || ' ' || coalesce(${lots.description}, ''))`;
      const conditions: SQL[] = [
        inArray(lots.status, ['for_sale', 'in_auction']),
        gt(lots.createdAt, search.lastNotifiedAt),
        ...words.map((w) => sql`${haystack} ILIKE ${'%' + escapeLike(w) + '%'}`),
      ];
      if (search.categoryId) conditions.push(eq(lots.categoryId, search.categoryId));

      const matches = await db
        .select({
          title: lots.title,
          slug: lots.slug,
          id: lots.id,
          saleType: lots.saleType,
          primaryImageUrl: lots.primaryImageUrl,
          estimateLow: lots.estimateLow,
          estimateHigh: lots.estimateHigh,
          buyNowPrice: lots.buyNowPrice,
        })
        .from(lots)
        .where(and(...conditions))
        .orderBy(asc(lots.createdAt))
        .limit(MAX_LOTS_PER_EMAIL);

      if (matches.length === 0) continue;
      searchesMatched++;

      const searchLabel = search.query || 'your followed department';
      try {
        await sendSavedSearchAlert({
          email: search.email,
          searchLabel,
          searchUrl: search.query
            ? `${BASE_URL}/search?q=${encodeURIComponent(search.query)}`
            : `${BASE_URL}/search`,
          baseUrl: BASE_URL,
          lots: matches.map((lot) => ({
            title: lot.title,
            url: lotUrl(lot),
            imageUrl: lot.primaryImageUrl,
            estimateLow: lot.estimateLow,
            estimateHigh: lot.estimateHigh,
            buyNowPrice: lot.buyNowPrice,
          })),
        });
        emailsSent++;
        // Advance the watermark only after a successful send so a failed
        // email is retried on the next run instead of silently dropped.
        await db
          .update(savedSearches)
          .set({ lastNotifiedAt: sql`now()` })
          .where(eq(savedSearches.id, search.id));
      } catch (err) {
        logger.error('Saved search alert send failed', err, { savedSearchId: search.id });
      }
    }

    return NextResponse.json({
      success: true,
      searchesChecked: searches.length,
      searchesMatched,
      emailsSent,
    });
  } catch (error) {
    logger.error('Saved search alerts cron failed', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
