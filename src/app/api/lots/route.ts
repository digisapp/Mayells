import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { lots, lotImages, users } from '@/db/schema';
import { eq, desc, asc, and, ilike, sql } from 'drizzle-orm';
import { createClient } from '@/lib/supabase/server';
import { lotSchema } from '@/lib/validation/schemas';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const category = searchParams.get('category');
    const status = searchParams.get('status');
    const sort = searchParams.get('sort') ?? 'newest';
    const limit = Math.max(1, Math.min(parseInt(searchParams.get('limit') ?? '24') || 24, 100));
    const offset = Math.max(0, parseInt(searchParams.get('offset') ?? '0') || 0);
    const search = searchParams.get('q');

    const conditions = [];

    if (category) {
      conditions.push(eq(lots.categoryId, category));
    }
    if (status) {
      conditions.push(eq(lots.status, status as 'draft' | 'in_auction' | 'sold' | 'for_sale'));
    }
    const saleType = searchParams.get('saleType');
    if (saleType) {
      conditions.push(eq(lots.saleType, saleType as 'auction' | 'gallery' | 'private'));
    }
    if (search) {
      const trimmed = search.slice(0, 200); // Cap search length
      conditions.push(ilike(lots.title, `%${trimmed}%`));
    }
    const minPrice = searchParams.get('minPrice');
    const maxPrice = searchParams.get('maxPrice');
    if (minPrice) {
      const min = Math.max(0, parseInt(minPrice));
      if (!isNaN(min)) {
        conditions.push(sql`COALESCE(${lots.buyNowPrice}, ${lots.estimateLow}, ${lots.currentBidAmount}) >= ${min}`);
      }
    }
    if (maxPrice) {
      const max = parseInt(maxPrice);
      if (!isNaN(max)) {
        conditions.push(sql`COALESCE(${lots.buyNowPrice}, ${lots.estimateHigh}, ${lots.currentBidAmount}) <= ${max}`);
      }
    }

    const orderBy = sort === 'price_asc'
      ? asc(lots.currentBidAmount)
      : sort === 'price_desc'
        ? desc(lots.currentBidAmount)
        : sort === 'ending_soon'
          ? asc(lots.createdAt)
          : desc(lots.createdAt);

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [result, countResult] = await Promise.all([
      db.select().from(lots).where(where).orderBy(orderBy).limit(limit).offset(offset),
      db.select({ count: sql<number>`count(*)` }).from(lots).where(where),
    ]);

    return NextResponse.json({
      data: result,
      total: Number(countResult[0].count),
      limit,
      offset,
    });
  } catch (error) {
    console.error('Lots list error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const [profile] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
    if (!profile || profile.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();
    const parsed = lotSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const slug = parsed.data.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      + '-' + Date.now().toString(36);

    const [lot] = await db.insert(lots).values({
      ...parsed.data,
      slug,
      status: 'draft',
    }).returning();

    return NextResponse.json({ data: lot }, { status: 201 });
  } catch (error) {
    console.error('Create lot error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
