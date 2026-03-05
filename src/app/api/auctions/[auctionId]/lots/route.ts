import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/db';
import { auctionLots, lots, auctions, users } from '@/db/schema';
import { eq, asc, sql } from 'drizzle-orm';
import { assignLotSchema } from '@/lib/validation/schemas';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ auctionId: string }> },
) {
  try {
    const { auctionId } = await params;

    // Find auction by ID or slug
    let [auction] = await db
      .select()
      .from(auctions)
      .where(eq(auctions.id, auctionId))
      .limit(1);

    if (!auction) {
      [auction] = await db
        .select()
        .from(auctions)
        .where(eq(auctions.slug, auctionId))
        .limit(1);
    }

    if (!auction) {
      return NextResponse.json({ error: 'Auction not found' }, { status: 404 });
    }

    const result = await db
      .select({
        auctionLot: auctionLots,
        lot: lots,
      })
      .from(auctionLots)
      .innerJoin(lots, eq(auctionLots.lotId, lots.id))
      .where(eq(auctionLots.auctionId, auction.id))
      .orderBy(asc(auctionLots.lotNumber));

    const lotsWithNumbers = result.map(({ auctionLot, lot }) => ({
      ...lot,
      lotNumber: auctionLot.lotNumber,
      closingAt: auctionLot.closingAt,
    }));

    return NextResponse.json({ data: lotsWithNumbers });
  } catch (error) {
    console.error('Auction lots error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ auctionId: string }> },
) {
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

    const { auctionId } = await params;
    const body = await req.json();
    const parsed = assignLotSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const [auction] = await db.select().from(auctions).where(eq(auctions.id, auctionId)).limit(1);
    if (!auction) {
      return NextResponse.json({ error: 'Auction not found' }, { status: 404 });
    }

    const [auctionLot] = await db
      .insert(auctionLots)
      .values({
        auctionId,
        lotId: parsed.data.lotId,
        lotNumber: parsed.data.lotNumber,
      })
      .returning();

    // Update lot status and auction lot count
    await Promise.all([
      db.update(lots).set({ status: 'in_auction', updatedAt: sql`now()` }).where(eq(lots.id, parsed.data.lotId)),
      db.update(auctions).set({ lotCount: sql`${auctions.lotCount} + 1`, updatedAt: sql`now()` }).where(eq(auctions.id, auctionId)),
    ]);

    return NextResponse.json({ data: auctionLot }, { status: 201 });
  } catch (error) {
    console.error('Assign lot error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ auctionId: string }> },
) {
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

    const { auctionId } = await params;
    const { lotId } = await req.json();

    if (!lotId) {
      return NextResponse.json({ error: 'lotId is required' }, { status: 400 });
    }

    const [existing] = await db
      .select()
      .from(auctionLots)
      .where(eq(auctionLots.lotId, lotId))
      .limit(1);

    if (!existing || existing.auctionId !== auctionId) {
      return NextResponse.json({ error: 'Lot not found in auction' }, { status: 404 });
    }

    await db.delete(auctionLots).where(eq(auctionLots.id, existing.id));

    // Revert lot status and update auction lot count
    await Promise.all([
      db.update(lots).set({ status: 'approved', updatedAt: sql`now()` }).where(eq(lots.id, lotId)),
      db.update(auctions).set({ lotCount: sql`${auctions.lotCount} - 1`, updatedAt: sql`now()` }).where(eq(auctions.id, auctionId)),
    ]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Remove lot error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
