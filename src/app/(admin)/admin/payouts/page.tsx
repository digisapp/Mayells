'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { Banknote, CircleDollarSign, ChevronLeft, ChevronRight, Search, Download } from 'lucide-react';
import { formatCurrencyWithCents } from '@/types';
import { toast } from 'sonner';

type PayoutStatus = 'pending' | 'paid' | 'cancelled' | 'reversed';

interface PayoutRow {
  payout: {
    id: string;
    status: PayoutStatus;
    hammerPrice: number;
    commissionPercent: number;
    commissionAmount: number;
    commissionSource: 'consignment' | 'prospect' | 'default' | null;
    netAmount: number;
    method: string | null;
    reference: string | null;
    notes: string | null;
    paidAt: string | null;
    statementSentAt: string | null;
    createdAt: string;
  };
  seller: { id: string; fullName: string | null; email: string };
  lot: { id: string; title: string };
  invoice: { id: string; invoiceNumber: string; status: string };
  auction: { id: string; title: string } | null;
}

interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

interface PayoutStats {
  pending: number;
  pendingNet: number;
  paid: number;
  paidNet: number;
  reversed: number;
  reversedNet: number;
  commissionEarned: number;
  commissionEarnedThisMonth: number;
}

interface SellerOption { id: string; fullName: string | null; email: string }
interface AuctionOption { id: string; title: string }

interface Filters {
  status: string;
  sellerId: string;
  auctionId: string;
  search: string;
}

type PendingAction =
  | { kind: 'single'; row: PayoutRow }
  | { kind: 'bulk'; seller: PayoutRow['seller']; rows: PayoutRow[] }
  | null;

const EMPTY_STATS: PayoutStats = {
  pending: 0, pendingNet: 0, paid: 0, paidNet: 0, reversed: 0, reversedNet: 0,
  commissionEarned: 0, commissionEarnedThisMonth: 0,
};

const statusColors: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  pending: 'outline',
  paid: 'default',
  cancelled: 'secondary',
  reversed: 'destructive',
};

const SOURCE_LABEL: Record<string, string> = {
  consignment: 'consignment rate',
  prospect: 'agreed rate',
  default: 'house rate',
};

const METHODS = [
  { value: 'wire', label: 'Wire transfer' },
  { value: 'check', label: 'Check' },
  { value: 'other', label: 'Other' },
] as const;
type Method = (typeof METHODS)[number]['value'];

const STATUS_FILTERS = ['all', 'pending', 'paid', 'reversed', 'cancelled'] as const;

async function readBody(res: Response): Promise<Record<string, unknown> | null> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function errorMessage(res: Response, body: Record<string, unknown> | null, fallback: string): string {
  const err = body?.error;
  return typeof err === 'string' && err ? err : `${fallback} (HTTP ${res.status})`;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function sellerLabel(s: PayoutRow['seller']): string {
  return s.fullName ? `${s.fullName} (${s.email})` : s.email;
}

export default function AdminPayoutsPage() {
  const [rows, setRows] = useState<PayoutRow[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, pageSize: 100, total: 0, totalPages: 0 });
  const [stats, setStats] = useState<PayoutStats>(EMPTY_STATS);
  const [sellers, setSellers] = useState<SellerOption[]>([]);
  const [auctions, setAuctions] = useState<AuctionOption[]>([]);
  const [filters, setFilters] = useState<Filters>({ status: 'all', sellerId: 'all', auctionId: 'all', search: '' });
  const [searchInput, setSearchInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [pending, setPending] = useState<PendingAction>(null);
  // Filters can arrive in the URL (the dashboard, settlement and user pages
  // link here with ?status= / ?sellerId= / ?q=). Read them once on mount,
  // then fetch — avoids a wasted unfiltered request.
  const [ready, setReady] = useState(false);

  // Mark-paid form state (shared by the single and bulk dialogs)
  const [method, setMethod] = useState<Method>('wire');
  const [reference, setReference] = useState('');
  const [paidAt, setPaidAt] = useState(todayIso());
  const [notes, setNotes] = useState('');

  const buildParams = useCallback((page: number, f: Filters) => {
    const params = new URLSearchParams({ page: String(page) });
    if (f.status !== 'all') params.set('status', f.status);
    if (f.sellerId !== 'all') params.set('sellerId', f.sellerId);
    if (f.auctionId !== 'all') params.set('auctionId', f.auctionId);
    if (f.search) params.set('q', f.search);
    return params;
  }, []);

  const fetchPayouts = useCallback(async (page: number, f: Filters, silent = false) => {
    if (!silent) setLoading(true);
    setLoadError(false);
    try {
      const res = await fetch(`/api/admin/payouts?${buildParams(page, f)}`);
      const body = await readBody(res);
      if (!res.ok || !body) throw new Error(errorMessage(res, body, 'Failed to load payouts'));
      setRows((body.data as PayoutRow[]) ?? []);
      if (body.pagination) setPagination(body.pagination as Pagination);
      if (body.stats) setStats(body.stats as PayoutStats);
      if (body.sellers) setSellers(body.sellers as SellerOption[]);
      if (body.auctions) setAuctions(body.auctions as AuctionOption[]);
    } catch (err) {
      setLoadError(true);
      toast.error(err instanceof Error ? err.message : 'Failed to load payouts');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [buildParams]);

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const status = sp.get('status');
    const search = (sp.get('q') ?? sp.get('search'))?.trim() ?? '';
    setFilters({
      status: status && (STATUS_FILTERS as readonly string[]).includes(status) ? status : 'all',
      sellerId: sp.get('sellerId') || 'all',
      auctionId: sp.get('auctionId') || 'all',
      search,
    });
    setSearchInput(search);
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    fetchPayouts(pagination.page, filters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, pagination.page, filters]);

  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => {
      setFilters((f) => (f.search === searchInput.trim() ? f : { ...f, search: searchInput.trim() }));
      setPagination((p) => (p.page === 1 ? p : { ...p, page: 1 }));
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput, ready]);

  function updateFilters(patch: Partial<Filters>) {
    setFilters((f) => ({ ...f, ...patch }));
    setPagination((p) => ({ ...p, page: 1 }));
  }

  function openAction(action: NonNullable<PendingAction>) {
    setMethod('wire');
    setReference('');
    setPaidAt(todayIso());
    setNotes('');
    setPending(action);
  }

  // Group the page's rows by consignor (API already orders by seller).
  const groups = useMemo(() => {
    const map = new Map<string, { seller: PayoutRow['seller']; rows: PayoutRow[] }>();
    for (const row of rows) {
      const g = map.get(row.seller.id) ?? { seller: row.seller, rows: [] };
      g.rows.push(row);
      map.set(row.seller.id, g);
    }
    return Array.from(map.values());
  }, [rows]);

  async function confirmSingle(row: PayoutRow) {
    const res = await fetch(`/api/admin/payouts/${row.payout.id}/mark-paid`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        method,
        reference: reference || undefined,
        notes: notes || undefined,
        paidAt: paidAt ? new Date(`${paidAt}T12:00:00`).toISOString() : undefined,
      }),
    });
    const body = await readBody(res);
    if (!res.ok) {
      const msg = errorMessage(res, body, 'Failed to mark payout paid');
      toast.error(msg);
      throw new Error(msg);
    }
    toast.success(`${formatCurrencyWithCents(row.payout.netAmount)} to ${row.seller.fullName || row.seller.email} recorded as paid`);
    await fetchPayouts(pagination.page, filters, true);
  }

  async function confirmBulk(sellerRows: PayoutRow[]) {
    const payoutIds = sellerRows.map((r) => r.payout.id);
    const res = await fetch('/api/admin/payouts/bulk-mark-paid', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        payoutIds,
        method,
        reference: reference || undefined,
        notes: notes || undefined,
        paidAt: paidAt ? new Date(`${paidAt}T12:00:00`).toISOString() : undefined,
      }),
    });
    const body = await readBody(res);
    if (!res.ok) {
      const msg = errorMessage(res, body, 'Failed to mark payouts paid');
      toast.error(msg);
      throw new Error(msg);
    }
    const data = (body?.data ?? {}) as { paid?: number; totalNet?: number; skipped?: { reason: string }[] };
    toast.success(`${data.paid ?? payoutIds.length} payout(s) totalling ${formatCurrencyWithCents(data.totalNet ?? 0)} recorded as paid`);
    for (const s of data.skipped ?? []) toast.warning(`Skipped: ${s.reason}`);
    await fetchPayouts(pagination.page, filters, true);
  }

  const exportUrl = `/api/admin/payouts/export.csv?${buildParams(1, filters)}`;

  const dialogFields = (
    <div className="grid grid-cols-2 gap-3">
      <div className="space-y-1.5">
        <Label>Method</Label>
        <Select value={method} onValueChange={(v) => setMethod(v as Method)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {METHODS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="payoutPaidAt">Sent on</Label>
        <Input id="payoutPaidAt" type="date" value={paidAt} max={todayIso()} onChange={(e) => setPaidAt(e.target.value)} />
      </div>
      <div className="space-y-1.5 col-span-2">
        <Label htmlFor="payoutReference">Reference (wire ID / check #)</Label>
        <Input id="payoutReference" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Optional" />
      </div>
      <div className="space-y-1.5 col-span-2">
        <Label htmlFor="payoutNotes">Notes (internal)</Label>
        <Textarea id="payoutNotes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Optional" />
      </div>
    </div>
  );

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="font-display text-display-sm flex items-center gap-3">
            <Banknote className="h-6 w-6" />
            Payouts
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">Consignor settlements — created when the buyer&apos;s invoice is paid</p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <StatTile label="Owed to consignors" value={formatCurrencyWithCents(stats.pendingNet)} sub={`${stats.pending} pending`} dot="bg-yellow-500" />
          <StatTile label="Paid out" value={formatCurrencyWithCents(stats.paidNet)} sub={`${stats.paid} paid${stats.reversed ? ` · ${stats.reversed} reversed` : ''}`} dot="bg-green-500" />
          <StatTile label="House commission (month)" value={formatCurrencyWithCents(stats.commissionEarnedThisMonth)} sub="on settled sales" dot="bg-champagne" />
          <StatTile label="House commission (all time)" value={formatCurrencyWithCents(stats.commissionEarned)} sub="pending + paid payouts" dot="bg-emerald-700" />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        {STATUS_FILTERS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => updateFilters({ status: s })}
            className={`text-xs px-3 py-1.5 rounded-md border transition-colors capitalize ${
              filters.status === s
                ? 'bg-foreground text-background border-foreground'
                : 'border-border/50 hover:bg-accent/10'
            }`}
          >
            {s}
          </button>
        ))}
        <div className="relative min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Consignor, lot, invoice #, reference"
            className="h-8 pl-8 text-xs"
          />
        </div>
        <Select value={filters.sellerId} onValueChange={(v) => updateFilters({ sellerId: v })}>
          <SelectTrigger size="sm" className="text-xs min-w-[180px]">
            <SelectValue placeholder="All consignors" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All consignors</SelectItem>
            {sellers.map((s) => (
              <SelectItem key={s.id} value={s.id}>{s.fullName || s.email}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filters.auctionId} onValueChange={(v) => updateFilters({ auctionId: v })}>
          <SelectTrigger size="sm" className="text-xs min-w-[160px]">
            <SelectValue placeholder="All sales" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sales</SelectItem>
            {auctions.map((a) => (
              <SelectItem key={a.id} value={a.id}>{a.title}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button asChild variant="outline" size="sm" className="gap-1.5 text-xs">
          <a href={exportUrl}>
            <Download className="h-3.5 w-3.5" /> CSV
          </a>
        </Button>
      </div>

      {loading && (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-16 bg-muted/30 rounded animate-pulse" />)}
        </div>
      )}

      {!loading && loadError && (
        <div className="text-center py-16 text-muted-foreground">
          <CircleDollarSign className="h-12 w-12 mx-auto mb-4 opacity-30" />
          <p>Failed to load payouts.</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => fetchPayouts(pagination.page, filters)}>
            Retry
          </Button>
        </div>
      )}

      {!loading && !loadError && rows.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <CircleDollarSign className="h-12 w-12 mx-auto mb-4 opacity-30" />
          <p>
            {filters.status === 'all' && !filters.search && filters.sellerId === 'all' && filters.auctionId === 'all'
              ? 'No payouts yet. They appear here once a buyer pays an invoice.'
              : 'No payouts match these filters.'}
          </p>
        </div>
      )}

      {!loading && rows.length > 0 && (
        <div className="border border-border/50 rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/20 border-b border-border/50">
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-left px-4 py-3 font-medium">Lot</th>
                <th className="text-right px-4 py-3 font-medium">Hammer</th>
                <th className="text-right px-4 py-3 font-medium">Commission</th>
                <th className="text-right px-4 py-3 font-medium">Net to consignor</th>
                <th className="text-left px-4 py-3 font-medium">Payment</th>
                <th className="text-left px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {groups.map(({ seller, rows: sellerRows }) => {
                const pendingRows = sellerRows.filter((r) => r.payout.status === 'pending' && r.invoice.status === 'paid');
                const pendingNet = pendingRows.reduce((sum, r) => sum + r.payout.netAmount, 0);
                const paidNet = sellerRows.filter((r) => r.payout.status === 'paid').reduce((sum, r) => sum + r.payout.netAmount, 0);
                return [
                  <tr key={`group-${seller.id}`} className="bg-muted/10 border-b border-border/40">
                    <td colSpan={4} className="px-4 py-2">
                      <Link href={`/admin/users/${seller.id}`} className="font-medium hover:underline">
                        {seller.fullName || 'Unknown consignor'}
                      </Link>
                      <span className="text-xs text-muted-foreground ml-2">{seller.email}</span>
                    </td>
                    <td className="px-4 py-2 text-right text-xs">
                      {pendingNet > 0 && <div className="font-medium tabular-nums">{formatCurrencyWithCents(pendingNet)} owed</div>}
                      {paidNet > 0 && <div className="text-muted-foreground tabular-nums">{formatCurrencyWithCents(paidNet)} paid</div>}
                    </td>
                    <td colSpan={2} className="px-4 py-2 text-right">
                      {pendingRows.length > 1 && (
                        <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => openAction({ kind: 'bulk', seller, rows: pendingRows })}>
                          Mark all {pendingRows.length} paid
                        </Button>
                      )}
                    </td>
                  </tr>,
                  ...sellerRows.map(({ payout, lot, invoice, auction }) => (
                    <tr key={payout.id} className="border-b border-border/30 hover:bg-muted/10">
                      <td className="px-4 py-3">
                        <Badge variant={statusColors[payout.status] || 'outline'}>{payout.status}</Badge>
                        {payout.status === 'pending' && invoice.status !== 'paid' && (
                          <div className="text-[11px] text-red-600 mt-1">invoice {invoice.status}</div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Link href={`/admin/lots/${lot.id}`} className="block max-w-[240px] truncate hover:underline" title={lot.title}>
                          {lot.title}
                        </Link>
                        <div className="text-xs text-muted-foreground">
                          <Link href={`/admin/invoices?q=${encodeURIComponent(invoice.invoiceNumber)}`} className="font-mono hover:underline">
                            {invoice.invoiceNumber}
                          </Link>
                          {auction && <span> · {auction.title}</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{formatCurrencyWithCents(payout.hammerPrice)}</td>
                      <td className="px-4 py-3 text-right text-muted-foreground tabular-nums">
                        {formatCurrencyWithCents(payout.commissionAmount)}
                        <div className="text-[11px]">
                          {payout.commissionPercent}%
                          {payout.commissionSource && <span> · {SOURCE_LABEL[payout.commissionSource] ?? payout.commissionSource}</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-medium tabular-nums">{formatCurrencyWithCents(payout.netAmount)}</td>
                      <td className="px-4 py-3">
                        {payout.status === 'paid' || payout.status === 'reversed' ? (
                          <div>
                            <span className="capitalize">{payout.method || '—'}</span>
                            {payout.reference && <span className="font-mono text-xs ml-1">({payout.reference})</span>}
                            <div className="text-xs text-muted-foreground">
                              {payout.paidAt ? new Date(payout.paidAt).toLocaleDateString() : ''}
                            </div>
                            {payout.status === 'reversed' && (
                              <div className="text-[11px] text-destructive">clawback required</div>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-xs">
                            created {new Date(payout.createdAt).toLocaleDateString()}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {payout.status === 'pending' && invoice.status === 'paid' && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-xs h-7"
                            onClick={() => openAction({ kind: 'single', row: { payout, seller, lot, invoice, auction } })}
                          >
                            Mark paid
                          </Button>
                        )}
                      </td>
                    </tr>
                  )),
                ];
              })}
            </tbody>
          </table>
        </div>
      )}

      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm">
          <p className="text-muted-foreground">
            Page {pagination.page} of {pagination.totalPages}
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={pagination.page <= 1}
              onClick={() => setPagination((p) => ({ ...p, page: p.page - 1 }))} className="gap-1">
              <ChevronLeft className="h-3.5 w-3.5" /> Prev
            </Button>
            <Button size="sm" variant="outline" disabled={pagination.page >= pagination.totalPages}
              onClick={() => setPagination((p) => ({ ...p, page: p.page + 1 }))} className="gap-1">
              Next <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={pending?.kind === 'single'}
        onOpenChange={(open) => !open && setPending(null)}
        title="Record consignor payment"
        confirmLabel="Mark paid"
        onConfirm={async () => {
          if (pending?.kind === 'single') await confirmSingle(pending.row);
        }}
        description={pending?.kind === 'single' && (
          <div className="space-y-3 text-sm">
            <p>
              Record that <strong>{formatCurrencyWithCents(pending.row.payout.netAmount)}</strong> was sent to{' '}
              <strong>{sellerLabel(pending.row.seller)}</strong> for <em>{pending.row.lot.title}</em>.
              The consignor receives a &ldquo;payment sent&rdquo; email.
            </p>
            {dialogFields}
          </div>
        )}
      />

      <ConfirmDialog
        open={pending?.kind === 'bulk'}
        onOpenChange={(open) => !open && setPending(null)}
        title="Record one payment for several payouts"
        confirmLabel="Mark all paid"
        onConfirm={async () => {
          if (pending?.kind === 'bulk') await confirmBulk(pending.rows);
        }}
        description={pending?.kind === 'bulk' && (
          <div className="space-y-3 text-sm">
            <p>
              Record that <strong>{formatCurrencyWithCents(pending.rows.reduce((s, r) => s + r.payout.netAmount, 0))}</strong> was sent to{' '}
              <strong>{sellerLabel(pending.seller)}</strong> covering {pending.rows.length} lots:
            </p>
            <ul className="text-xs text-muted-foreground max-h-32 overflow-y-auto space-y-0.5 pl-4 list-disc">
              {pending.rows.map((r) => (
                <li key={r.payout.id}>{r.lot.title} — {formatCurrencyWithCents(r.payout.netAmount)}</li>
              ))}
            </ul>
            {dialogFields}
          </div>
        )}
      />
    </div>
  );
}

function StatTile({ label, value, sub, dot }: { label: string; value: string; sub: string; dot: string }) {
  return (
    <div className="rounded-md border border-border/50 px-3 py-2 min-w-[150px]">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className={`h-2 w-2 rounded-full ${dot}`} />
        {label}
      </div>
      <div className="font-medium tabular-nums">{value}</div>
      <div className="text-[11px] text-muted-foreground">{sub}</div>
    </div>
  );
}
