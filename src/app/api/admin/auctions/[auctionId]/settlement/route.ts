import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/auth/require-admin';
import { loadAuctionSettlement } from '@/lib/invoicing/settlement-report';
import { logger } from '@/lib/logger';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** GET /api/admin/auctions/[auctionId]/settlement — per-sale reconciliation. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ auctionId: string }> },
) {
  try {
    const { admin, response } = await requireAdminApi();
    if (!admin) return response;

    const { auctionId } = await params;
    if (!UUID_RE.test(auctionId)) {
      return NextResponse.json({ error: 'Auction not found' }, { status: 404 });
    }

    const report = await loadAuctionSettlement(auctionId);
    if (!report) return NextResponse.json({ error: 'Auction not found' }, { status: 404 });

    return NextResponse.json({ data: report });
  } catch (error) {
    logger.error('Admin auction settlement error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
