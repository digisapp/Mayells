export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/admin/PageHeader';
import { requireAdminPage } from '@/lib/auth/require-admin';
import { loadAuctionSettlement, type SettlementLotRow } from '@/lib/invoicing/settlement-report';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatCurrency, formatCurrencyWithCents } from '@/types';
import { auctionStatus, lotStatus } from '@/lib/admin/status/sales';
import { formatShortDate } from '@/lib/format/dates';
import { formatEstimate } from '@/lib/format/estimate';
import { INVOICE_STATUS, PAYOUT_STATUS, SHIPMENT_STATUS, statusBadge } from '@/lib/admin/status/money';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const INVOICE_ORDER = ['pending', 'overdue', 'paid', 'refunded', 'cancelled'];
const PAYOUT_ORDER = ['pending', 'paid', 'reversed', 'cancelled'];

function pct(part: number, whole: number): string {
  if (!whole) return '—';
  return `${Math.round((part / whole) * 100)}%`;
}

// House timezone: an 8pm ET close must not read as the next day (UTC server).
function fmtDate(d: Date | null): string {
  return d ? formatShortDate(d) : '—';
}

export default async function AuctionSettlementPage({
  params,
}: {
  params: Promise<{ auctionId: string }>;
}) {
  await requireAdminPage();
  const { auctionId } = await params;
  if (!UUID_RE.test(auctionId)) notFound();

  const report = await loadAuctionSettlement(auctionId);
  if (!report) notFound();

  const { auction, lots, totals, invoicesByStatus, payoutsByStatus, shipmentsByStatus, rows } = report;
  const sellThrough = pct(lots.sold, lots.offered - lots.withdrawn);
  const shipmentStatuses = Object.keys(shipmentsByStatus).sort();

  return (
    <div className="max-w-6xl">
      <PageHeader
        title="Settlement"
        badges={
          lots.open > 0 && (
            <Badge className="bg-purple-100 text-purple-800">{lots.open} lot{lots.open === 1 ? '' : 's'} still settling</Badge>
          )
        }
        description={
          <>
            {auction.title}
            {auction.saleNumber ? ` · Sale ${auction.saleNumber}` : ''}
            {' · '}
            {auctionStatus(auction.status).label}
            {auction.actualEndedAt || auction.biddingEndsAt
              ? ` · ended ${fmtDate(auction.actualEndedAt ?? auction.biddingEndsAt)}`
              : ''}
            {` · ${auction.buyerPremiumPercent}% buyer's premium`}
          </>
        }
      >
        {/* Headline numbers */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Tile label="Lots" value={`${lots.sold} / ${lots.offered} sold`} sub={`${lots.unsold} unsold · ${lots.withdrawn} withdrawn · ${sellThrough} sell-through`} />
          <Tile label="Hammer total" value={formatCurrencyWithCents(totals.hammer)} sub={`vs est. ${formatCurrency(totals.soldEstimateLow)}–${formatCurrency(totals.soldEstimateHigh)} (sold lots)`} />
          <Tile label="Buyer's premium" value={formatCurrencyWithCents(totals.premium)} sub={`${formatCurrencyWithCents(totals.invoiced)} invoiced (live invoices)`} />
          <Tile label="House commission" value={formatCurrencyWithCents(totals.commission)} sub={`house revenue ${formatCurrencyWithCents(totals.commission + totals.premium)}`} />
        </div>
      </PageHeader>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10">
        <MiniTable
          title="Invoices"
          rows={INVOICE_ORDER.filter((s) => invoicesByStatus[s]).map((s) => ({
            label: statusBadge(INVOICE_STATUS, s).label,
            count: invoicesByStatus[s].count,
            amount: formatCurrencyWithCents(invoicesByStatus[s].amount),
            color: statusBadge(INVOICE_STATUS, s).className,
          }))}
          empty="No invoices"
        />
        <MiniTable
          title="Payouts"
          rows={PAYOUT_ORDER.filter((s) => payoutsByStatus[s]).map((s) => ({
            label: statusBadge(PAYOUT_STATUS, s).label,
            count: payoutsByStatus[s].count,
            amount: formatCurrencyWithCents(payoutsByStatus[s].amount),
            color: statusBadge(PAYOUT_STATUS, s).className,
          }))}
          empty="No payouts yet"
        />
        <MiniTable
          title="Shipments"
          rows={shipmentStatuses.map((s) => ({
            label: statusBadge(SHIPMENT_STATUS, s).label,
            count: shipmentsByStatus[s],
            amount: '',
            color: statusBadge(SHIPMENT_STATUS, s).className,
          }))}
          empty="No shipments yet"
        />
      </div>

      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
        <h2 className="font-display text-lg">Lots</h2>
        <p className="text-xs text-muted-foreground">
          Estimate for the whole sale: {formatCurrency(totals.estimateLow)}–{formatCurrency(totals.estimateHigh)}
        </p>
      </div>
      <div className="border rounded-lg overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[60px]">Lot #</TableHead>
              <TableHead>Title</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Hammer</TableHead>
              <TableHead>Buyer</TableHead>
              <TableHead>Invoice</TableHead>
              <TableHead>Payout</TableHead>
              <TableHead>Shipment</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => <LotRow key={row.lotId} row={row} />)}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                  No lots were assigned to this sale.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function LotRow({ row }: { row: SettlementLotRow }) {
  return (
    <TableRow>
      <TableCell className="text-muted-foreground">{row.lotNumber}</TableCell>
      <TableCell className="max-w-[260px]">
        <Link href={`/admin/lots/${row.lotId}`} className="font-medium hover:underline block truncate" title={row.title}>
          {row.title}
        </Link>
        {formatEstimate(row.estimateLow, row.estimateHigh) && (
          <div className="text-[11px] text-muted-foreground">
            est. {formatEstimate(row.estimateLow, row.estimateHigh)}
          </div>
        )}
      </TableCell>
      <TableCell>
        <Badge className={lotStatus(row.status).className}>{lotStatus(row.status).label}</Badge>
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {row.hammerPrice != null ? formatCurrencyWithCents(row.hammerPrice) : '—'}
      </TableCell>
      <TableCell>
        {row.buyer ? (
          <Link href={`/admin/users/${row.buyer.id}`} className="hover:underline">
            {row.buyer.paddle && <span className="text-muted-foreground mr-1">#{row.buyer.paddle}</span>}
            {row.buyer.name || row.buyer.email}
          </Link>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell>
        {row.invoice ? (
          <Link href={`/admin/invoices?q=${encodeURIComponent(row.invoice.invoiceNumber)}`} className="inline-flex items-center gap-1.5 hover:underline">
            <span className="font-mono text-xs">{row.invoice.invoiceNumber}</span>
            <Badge className={statusBadge(INVOICE_STATUS, row.invoice.status).className}>{statusBadge(INVOICE_STATUS, row.invoice.status).label}</Badge>
            {row.invoice.disputedAt && <Badge className="bg-red-100 text-red-800 ml-1">Disputed</Badge>}
            {row.invoice.refundedAmount > 0 && row.invoice.status !== 'refunded' && (
              <Badge className="bg-amber-100 text-amber-800 ml-1">Partially refunded {formatCurrencyWithCents(row.invoice.refundedAmount)}</Badge>
            )}
          </Link>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell>
        {row.payout ? (
          <Link href={`/admin/payouts?status=${row.payout.status}`} className="hover:underline">
            <Badge className={statusBadge(PAYOUT_STATUS, row.payout.status).className}>{statusBadge(PAYOUT_STATUS, row.payout.status).label}</Badge>
          </Link>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell>
        {row.shipment ? (
          <Link href={`/admin/shipments?q=${encodeURIComponent(row.invoice?.invoiceNumber ?? '')}`} className="hover:underline">
            <Badge className={statusBadge(SHIPMENT_STATUS, row.shipment.status).className}>{statusBadge(SHIPMENT_STATUS, row.shipment.status).label}</Badge>
          </Link>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
    </TableRow>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="border rounded-lg p-4">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="font-display text-xl mt-1 tabular-nums">{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground mt-1">{sub}</p>}
    </div>
  );
}

function MiniTable({
  title,
  rows,
  empty,
}: {
  title: string;
  rows: { label: string; count: number; amount: string; color?: string }[];
  empty: string;
}) {
  return (
    <div className="border rounded-lg p-4">
      <h3 className="text-sm font-medium mb-3">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">{empty}</p>
      ) : (
        <table className="w-full text-sm">
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} className="border-t border-border/40 first:border-t-0">
                <td className="py-1.5">
                  <Badge className={r.color || 'bg-gray-100 text-gray-700'}>{r.label}</Badge>
                </td>
                <td className="py-1.5 text-right tabular-nums text-muted-foreground">{r.count}</td>
                <td className="py-1.5 text-right tabular-nums">{r.amount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
