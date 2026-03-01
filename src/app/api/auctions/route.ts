import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { auctions } from '@/db/schema';
import { eq, desc, and, inArray } from 'drizzle-orm';
import { createClient } from '@/lib/supabase/server';
import { auctionSchema } from '@/lib/validation/schemas';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');

    const conditions = [];
    if (status) {
      const statuses = status.split(',') as ('draft' | 'scheduled' | 'preview' | 'open' | 'closed')[];
      conditions.push(inArray(auctions.status, statuses));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const result = await db
      .select()
      .from(auctions)
      .where(where)
      .orderBy(desc(auctions.biddingStartsAt));

    return NextResponse.json({ data: result });
  } catch (error) {
    console.error('Auctions list error:', error);
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

    const body = await req.json();
    const parsed = auctionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const { previewStartsAt, biddingStartsAt, biddingEndsAt, ...rest } = parsed.data;
    const [auction] = await db.insert(auctions).values({
      ...rest,
      previewStartsAt: previewStartsAt ? new Date(previewStartsAt) : undefined,
      biddingStartsAt: biddingStartsAt ? new Date(biddingStartsAt) : undefined,
      biddingEndsAt: biddingEndsAt ? new Date(biddingEndsAt) : undefined,
      createdById: user.id,
    }).returning();

    return NextResponse.json({ data: auction }, { status: 201 });
  } catch (error) {
    console.error('Create auction error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
