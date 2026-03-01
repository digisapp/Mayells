import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { auctionLots, lots, auctions } from '@/db/schema';
import { eq, asc } from 'drizzle-orm';

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
