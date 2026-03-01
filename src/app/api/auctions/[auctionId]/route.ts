import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { auctions } from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ auctionId: string }> },
) {
  try {
    const { auctionId } = await params;

    // Try by ID first, then by slug
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

    return NextResponse.json({ data: auction });
  } catch (error) {
    console.error('Get auction error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
