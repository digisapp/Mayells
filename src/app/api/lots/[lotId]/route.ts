import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { lots, lotImages, bids } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ lotId: string }> },
) {
  try {
    const { lotId } = await params;

    const [lot] = await db
      .select()
      .from(lots)
      .where(eq(lots.id, lotId))
      .limit(1);

    if (!lot) {
      // Try by slug
      const [lotBySlug] = await db
        .select()
        .from(lots)
        .where(eq(lots.slug, lotId))
        .limit(1);

      if (!lotBySlug) {
        return NextResponse.json({ error: 'Lot not found' }, { status: 404 });
      }

      const images = await db
        .select()
        .from(lotImages)
        .where(eq(lotImages.lotId, lotBySlug.id))
        .orderBy(lotImages.sortOrder);

      const bidHistory = await db
        .select()
        .from(bids)
        .where(eq(bids.lotId, lotBySlug.id))
        .orderBy(desc(bids.createdAt))
        .limit(20);

      return NextResponse.json({ data: { ...lotBySlug, images, bidHistory } });
    }

    const images = await db
      .select()
      .from(lotImages)
      .where(eq(lotImages.lotId, lot.id))
      .orderBy(lotImages.sortOrder);

    const bidHistory = await db
      .select()
      .from(bids)
      .where(eq(bids.lotId, lot.id))
      .orderBy(desc(bids.createdAt))
      .limit(20);

    return NextResponse.json({ data: { ...lot, images, bidHistory } });
  } catch (error) {
    console.error('Get lot error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
