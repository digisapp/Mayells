import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/db';
import { watchlist, lots } from '@/db/schema';
import { eq, and, desc } from 'drizzle-orm';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const items = await db
      .select({
        watchlistId: watchlist.id,
        createdAt: watchlist.createdAt,
        lot: {
          id: lots.id,
          title: lots.title,
          lotNumber: lots.lotNumber,
          primaryImageUrl: lots.primaryImageUrl,
          currentBidAmount: lots.currentBidAmount,
          bidCount: lots.bidCount,
          estimateLow: lots.estimateLow,
          estimateHigh: lots.estimateHigh,
          status: lots.status,
          slug: lots.slug,
          artist: lots.artist,
        },
      })
      .from(watchlist)
      .innerJoin(lots, eq(watchlist.lotId, lots.id))
      .where(eq(watchlist.userId, user.id))
      .orderBy(desc(watchlist.createdAt))
      .limit(100);

    return NextResponse.json({ data: items });
  } catch (error) {
    console.error('Watchlist error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { lotId } = await request.json();
    if (!lotId) {
      return NextResponse.json({ error: 'lotId required' }, { status: 400 });
    }

    const [entry] = await db
      .insert(watchlist)
      .values({ userId: user.id, lotId })
      .onConflictDoNothing()
      .returning();

    return NextResponse.json({ data: entry }, { status: 201 });
  } catch (error) {
    console.error('Watchlist add error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { lotId } = await request.json();
    if (!lotId) {
      return NextResponse.json({ error: 'lotId required' }, { status: 400 });
    }

    await db
      .delete(watchlist)
      .where(and(eq(watchlist.userId, user.id), eq(watchlist.lotId, lotId)));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Watchlist remove error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
