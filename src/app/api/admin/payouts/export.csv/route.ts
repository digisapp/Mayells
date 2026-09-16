import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/auth/require-admin';
import { parsePayoutFilters, payoutWhere, payoutListQuery, payoutListOrder } from '@/lib/payouts/admin-query';
import { toCsv, centsToDecimal } from '@/lib/invoicing/csv';
import { logger } from '@/lib/logger';

const MAX_ROWS = 10000;

/** GET /api/admin/payouts/export.csv — honours the same filters as the list. */
export async function GET(req: NextRequest) {
  try {
    const { admin, response } = await requireAdminApi();
    if (!admin) return response;

    const filters = parsePayoutFilters(req.nextUrl.searchParams);
    const rows = await payoutListQuery()
      .where(payoutWhere(filters))
      .orderBy(...payoutListOrder)
      .limit(MAX_ROWS);

    const csv = toCsv(
      [
        'Consignor', 'Consignor email', 'Lot', 'Sale', 'Invoice #', 'Invoice status',
        'Hammer', 'Commission %', 'Commission', 'Rate source', 'Net to consignor',
        'Payout status', 'Method', 'Reference', 'Paid at', 'Created', 'Notes',
      ],
      rows.map(({ payout, seller, lot, invoice, auction }) => [
        seller.fullName ?? '',
        seller.email,
        lot.title,
        auction?.title ?? '',
        invoice.invoiceNumber,
        invoice.status,
        centsToDecimal(payout.hammerPrice),
        payout.commissionPercent,
        centsToDecimal(payout.commissionAmount),
        payout.commissionSource ?? '',
        centsToDecimal(payout.netAmount),
        payout.status,
        payout.method ?? '',
        payout.reference ?? '',
        payout.paidAt,
        payout.createdAt,
        payout.notes ?? '',
      ]),
    );

    const stamp = new Date().toISOString().slice(0, 10);
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="payouts-${stamp}.csv"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    logger.error('Admin payouts export error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
