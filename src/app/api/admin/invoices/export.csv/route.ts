import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/auth/require-admin';
import { parseInvoiceFilters, invoiceWhere, invoiceOrderBy, invoiceListQuery } from '@/lib/invoicing/admin-query';
import { toCsv, centsToDecimal } from '@/lib/invoicing/csv';
import { logger } from '@/lib/logger';

const MAX_ROWS = 10000;

/** GET /api/admin/invoices/export.csv — honours the same filters as the list. */
export async function GET(req: NextRequest) {
  try {
    const { admin, response } = await requireAdminApi();
    if (!admin) return response;

    const filters = parseInvoiceFilters(req.nextUrl.searchParams);
    const rows = await invoiceListQuery()
      .where(invoiceWhere(filters))
      .orderBy(...invoiceOrderBy(filters.sort))
      .limit(MAX_ROWS);

    const csv = toCsv(
      [
        'Invoice #', 'Status', 'Sale', 'Lot #', 'Lot', 'Buyer', 'Buyer email', 'Paddle',
        'Hammer', 'Premium', 'Shipping', 'Insurance', 'Tax', 'Total',
        'Created', 'Due', 'Paid at', 'Email sent', 'Payment', 'Refunded', 'Disputed at', 'Reconcile', 'Notes',
      ],
      rows.map((r) => [
        r.invoiceNumber,
        r.status,
        r.auctionTitle ?? '',
        r.lotNumber ?? '',
        r.lotTitle,
        r.buyerName ?? '',
        r.buyerEmail,
        r.buyerPaddle ?? '',
        centsToDecimal(r.hammerPrice),
        centsToDecimal(r.buyerPremium),
        centsToDecimal(r.shippingCost),
        centsToDecimal(r.insuranceCost),
        centsToDecimal(r.taxAmount),
        centsToDecimal(r.totalAmount),
        r.createdAt,
        r.dueDate,
        r.paidAt,
        r.emailSentAt,
        r.hasStripePayment ? 'stripe' : r.status === 'paid' || r.status === 'refunded' ? 'manual' : '',
        r.refundedAmount > 0 ? centsToDecimal(r.refundedAmount) : '',
        r.disputedAt,
        r.amountMismatch ? 'yes' : '',
        r.notes ?? '',
      ]),
    );

    const stamp = new Date().toISOString().slice(0, 10);
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="invoices-${stamp}.csv"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    logger.error('Admin invoices export error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
