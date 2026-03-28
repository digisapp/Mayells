import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/db';
import { auctions, auctionLots, lots, lotImages, users } from '@/db/schema';
import { eq, asc, inArray } from 'drizzle-orm';

/**
 * Export auction lots as a LiveAuctioneers-compatible CSV.
 *
 * Format spec:
 *  - LotNum (max 10 chars)
 *  - Title (max 49 chars)
 *  - Description (HTML ok, no external links)
 *  - LowEst / HighEst / StartPrice (numeric, no currency symbols, in dollars)
 *  - Condition
 *  - Reserve (internal only)
 *  - ImageFile.1 through ImageFile.10 (URLs accepted)
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ auctionId: string }> },
) {
  // Auth check
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

  // Get auction
  const [auction] = await db.select().from(auctions).where(eq(auctions.id, auctionId)).limit(1);
  if (!auction) {
    return NextResponse.json({ error: 'Auction not found' }, { status: 404 });
  }

  // Get assigned lots with their lot numbers
  const auctionLotRows = await db
    .select({ auctionLot: auctionLots, lot: lots })
    .from(auctionLots)
    .innerJoin(lots, eq(auctionLots.lotId, lots.id))
    .where(eq(auctionLots.auctionId, auction.id))
    .orderBy(asc(auctionLots.lotNumber));

  if (auctionLotRows.length === 0) {
    return NextResponse.json({ error: 'No lots assigned to this auction' }, { status: 400 });
  }

  // Get all images for these lots
  // Fetch all images for assigned lots in one query
  const lotIds = auctionLotRows.map(r => r.lot.id);
  const allImages = await db
    .select({ lotId: lotImages.lotId, url: lotImages.url })
    .from(lotImages)
    .where(inArray(lotImages.lotId, lotIds))
    .orderBy(asc(lotImages.sortOrder));

  const imagesByLot: Record<string, string[]> = {};
  for (const img of allImages) {
    if (!imagesByLot[img.lotId]) imagesByLot[img.lotId] = [];
    if (imagesByLot[img.lotId].length < 10) {
      imagesByLot[img.lotId].push(img.url);
    }
  }

  // Build CSV rows
  const maxImages = Math.max(
    1,
    ...Object.values(imagesByLot).map(imgs => imgs.length)
  );
  const imageHeaders = Array.from({ length: Math.min(maxImages, 10) }, (_, i) => `ImageFile.${i + 1}`);

  const headers = ['LotNum', 'Title', 'Description', 'LowEst', 'HighEst', 'StartPrice', 'Condition', 'Reserve', ...imageHeaders];

  const rows = auctionLotRows.map(({ auctionLot, lot }) => {
    const lotNum = String(auctionLot.lotNumber);

    // Title: max 49 chars
    const title = (lot.title || '').slice(0, 49);

    // Build description with attribution details
    const descParts: string[] = [];
    if (lot.artist) descParts.push(`Artist: ${lot.artist}`);
    if (lot.maker) descParts.push(`Maker: ${lot.maker}`);
    if (lot.period) descParts.push(`Period: ${lot.period}`);
    if (lot.circa) descParts.push(`Circa: ${lot.circa}`);
    if (lot.origin) descParts.push(`Origin: ${lot.origin}`);
    if (lot.medium) descParts.push(`Medium: ${lot.medium}`);
    if (lot.dimensions) descParts.push(`Dimensions: ${lot.dimensions}`);
    if (lot.weight) descParts.push(`Weight: ${lot.weight}`);
    if (descParts.length > 0) descParts.push(''); // blank line separator
    if (lot.description) descParts.push(lot.description);
    if (lot.provenance) {
      descParts.push('');
      descParts.push(`Provenance: ${lot.provenance}`);
    }

    const description = descParts.join('<br>');

    // Prices: convert from cents to dollars, no symbols
    const lowEst = lot.estimateLow ? String(lot.estimateLow / 100) : '';
    const highEst = lot.estimateHigh ? String(lot.estimateHigh / 100) : '';
    const startPrice = lot.startingBid ? String(lot.startingBid / 100) : '';
    const reserve = lot.reservePrice ? String(lot.reservePrice / 100) : '';

    // Condition
    const condition = lot.conditionNotes || (lot.condition ? lot.condition.replace('_', ' ') : '');

    // Images (URLs)
    const imgs = imagesByLot[lot.id] || [];
    // If no images in lotImages table, use primaryImageUrl
    if (imgs.length === 0 && lot.primaryImageUrl) {
      imgs.push(lot.primaryImageUrl);
    }

    const imageCols = Array.from({ length: imageHeaders.length }, (_, i) => imgs[i] || '');

    return [lotNum, title, description, lowEst, highEst, startPrice, condition, reserve, ...imageCols];
  });

  // Generate CSV string
  const csvLines = [
    headers.join(','),
    ...rows.map(row => row.map(escapeCSV).join(',')),
  ];
  const csv = csvLines.join('\r\n');

  // Return as downloadable CSV
  const filename = `${auction.slug || auction.id}-liveauctioneers.csv`;
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}

function escapeCSV(value: string): string {
  if (!value) return '';
  // Wrap in quotes if contains comma, quote, or newline
  if (value.includes(',') || value.includes('"') || value.includes('\n') || value.includes('<br>')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
