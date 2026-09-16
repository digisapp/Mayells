import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/auth/require-admin';
import { db } from '@/db';
import { auctions, auctionLots, lots, lotImages } from '@/db/schema';
import { eq, asc, inArray } from 'drizzle-orm';
import { UUID_RE } from '@/lib/bidding/lot-resolution';
import { logger } from '@/lib/logger';

/** LiveAuctioneers' hard limit on the Title column. */
const TITLE_MAX = 49;

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
 *
 * Titles longer than 49 characters are cut; the count of cut titles is
 * reported in the `X-Truncated-Titles` response header so the export can be
 * checked without opening the file.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ auctionId: string }> },
) {
  try {
    const { response } = await requireAdminApi();
    if (response) return response;

    const { auctionId } = await params;
    if (!UUID_RE.test(auctionId)) {
      return NextResponse.json({ error: 'Auction not found' }, { status: 404 });
    }

    const [auction] = await db.select().from(auctions).where(eq(auctions.id, auctionId)).limit(1);
    if (!auction) {
      return NextResponse.json({ error: 'Auction not found' }, { status: 404 });
    }

    // Assigned lots with their lot numbers, in catalogue order
    const auctionLotRows = await db
      .select({ auctionLot: auctionLots, lot: lots })
      .from(auctionLots)
      .innerJoin(lots, eq(auctionLots.lotId, lots.id))
      .where(eq(auctionLots.auctionId, auction.id))
      .orderBy(asc(auctionLots.lotNumber));

    if (auctionLotRows.length === 0) {
      return NextResponse.json({ error: 'No lots assigned to this auction' }, { status: 400 });
    }

    // All images for the assigned lots in one query
    const lotIds = auctionLotRows.map((r) => r.lot.id);
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
      ...Object.values(imagesByLot).map((imgs) => imgs.length),
    );
    const imageHeaders = Array.from({ length: Math.min(maxImages, 10) }, (_, i) => `ImageFile.${i + 1}`);

    const headers = ['LotNum', 'Title', 'Description', 'LowEst', 'HighEst', 'StartPrice', 'Condition', 'Reserve', ...imageHeaders];

    let truncatedTitles = 0;

    const rows = auctionLotRows.map(({ auctionLot, lot }) => {
      const lotNum = String(auctionLot.lotNumber);

      const fullTitle = lot.title || '';
      if (fullTitle.length > TITLE_MAX) truncatedTitles += 1;
      const title = fullTitle.slice(0, TITLE_MAX);

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
      if (lot.literature) {
        descParts.push('');
        descParts.push(`Literature: ${lot.literature}`);
      }
      if (lot.exhibited) {
        descParts.push('');
        descParts.push(`Exhibited: ${lot.exhibited}`);
      }

      const description = descParts.join('<br>');

      // Prices: convert from cents to dollars, no symbols
      const lowEst = lot.estimateLow ? String(lot.estimateLow / 100) : '';
      const highEst = lot.estimateHigh ? String(lot.estimateHigh / 100) : '';
      const startPrice = lot.startingBid ? String(lot.startingBid / 100) : '';
      const reserve = lot.reservePrice ? String(lot.reservePrice / 100) : '';

      // Condition
      const condition = lot.conditionNotes || (lot.condition ? lot.condition.replace('_', ' ') : '');

      // Images (URLs); fall back to the primary image when nothing is in lotImages
      const imgs = imagesByLot[lot.id] || [];
      if (imgs.length === 0 && lot.primaryImageUrl) {
        imgs.push(lot.primaryImageUrl);
      }

      const imageCols = Array.from({ length: imageHeaders.length }, (_, i) => imgs[i] || '');

      return [lotNum, title, description, lowEst, highEst, startPrice, condition, reserve, ...imageCols];
    });

    // Generate CSV string
    const csvLines = [
      headers.join(','),
      ...rows.map((row) => row.map(escapeCSV).join(',')),
    ];
    const csv = csvLines.join('\r\n');

    // Return as downloadable CSV
    const filename = `${auction.slug || auction.id}-liveauctioneers.csv`;
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'X-Truncated-Titles': String(truncatedTitles),
      },
    });
  } catch (error) {
    logger.error('Auction CSV export error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

function escapeCSV(value: string): string {
  if (!value) return '';

  // Neutralize spreadsheet formula injection: a cell beginning with =, +, -, @
  // (or a leading tab/CR that some parsers strip) is executed as a formula when
  // the CSV is opened in Excel/Sheets. These files are ingested by third parties
  // (LiveAuctioneers), so prefix such values with a single quote to force text.
  let out = value;
  if (/^[=+\-@\t\r]/.test(out)) {
    out = `'${out}`;
  }

  // Wrap in quotes if it contains a delimiter, quote, or any line break
  // (handle bare \r as well as \n / \r\n, since records are \r\n-separated).
  if (/[",\n\r]/.test(out) || out.includes('<br>')) {
    return `"${out.replace(/"/g, '""')}"`;
  }
  return out;
}
