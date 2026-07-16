import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/db';
import { savedSearches, categories } from '@/db/schema';
import { eq, and, desc, sql } from 'drizzle-orm';
import { rateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { z } from 'zod';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_SAVED_SEARCHES = 20;

async function requireUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

// GET /api/saved-searches — the signed-in user's saved searches.
export async function GET() {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const rows = await db
      .select({
        id: savedSearches.id,
        query: savedSearches.query,
        categoryId: savedSearches.categoryId,
        categoryName: categories.name,
        createdAt: savedSearches.createdAt,
      })
      .from(savedSearches)
      .leftJoin(categories, eq(categories.id, savedSearches.categoryId))
      .where(eq(savedSearches.userId, user.id))
      .orderBy(desc(savedSearches.createdAt));

    return NextResponse.json({ data: rows }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    logger.error('Saved searches list error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

const createSchema = z.object({
  query: z.string().trim().max(200).default(''),
  categoryId: z.string().regex(UUID_RE).nullable().optional(),
});

// POST /api/saved-searches { query, categoryId? } — save a search (idempotent
// per query+category).
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const { success } = await rateLimit(`saved-searches:${user.id}`, { maxRequests: 30, windowSeconds: 60 });
    if (!success) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

    const parsed = createSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }
    const query = parsed.data.query;
    const categoryId = parsed.data.categoryId ?? null;

    if (!query && !categoryId) {
      return NextResponse.json({ error: 'Enter a search or pick a department first' }, { status: 400 });
    }

    const existing = await db
      .select({ id: savedSearches.id })
      .from(savedSearches)
      .where(
        and(
          eq(savedSearches.userId, user.id),
          sql`lower(${savedSearches.query}) = lower(${query})`,
          categoryId ? eq(savedSearches.categoryId, categoryId) : sql`${savedSearches.categoryId} IS NULL`,
        ),
      )
      .limit(1);
    if (existing.length > 0) {
      return NextResponse.json({ data: { id: existing[0].id, alreadySaved: true } });
    }

    const countRows = await db
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(savedSearches)
      .where(eq(savedSearches.userId, user.id));
    if ((countRows[0]?.count ?? 0) >= MAX_SAVED_SEARCHES) {
      return NextResponse.json(
        { error: `You can save up to ${MAX_SAVED_SEARCHES} searches. Remove one first.` },
        { status: 400 },
      );
    }

    const [created] = await db
      .insert(savedSearches)
      .values({ userId: user.id, query, categoryId })
      .returning({ id: savedSearches.id });

    return NextResponse.json({ data: { id: created.id, alreadySaved: false } }, { status: 201 });
  } catch (error) {
    logger.error('Saved search create error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/saved-searches?id=... — remove one of the user's saved searches.
export async function DELETE(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const id = req.nextUrl.searchParams.get('id') ?? '';
    if (!UUID_RE.test(id)) {
      return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
    }

    await db
      .delete(savedSearches)
      .where(and(eq(savedSearches.id, id), eq(savedSearches.userId, user.id)));

    return NextResponse.json({ data: { removed: true } });
  } catch (error) {
    logger.error('Saved search delete error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
