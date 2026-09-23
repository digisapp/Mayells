'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { PageHeader } from '@/components/admin/PageHeader';
import {
  Copy, Loader2, ChevronLeft, ChevronRight, MoreHorizontal, Search, Download,
  ArrowUpDown, Mail, CheckCircle, XCircle, RotateCcw, CalendarPlus, Link2,
} from 'lucide-react';
import { formatCurrencyWithCents } from '@/types';
import { toast } from 'sonner';

interface InvoiceRow {
  id: string;
  invoiceNumber: string;
  accessToken: string;
  hammerPrice: number;
  buyerPremium: number;
  shippingCost: number | null;
  insuranceCost: number | null;
  taxAmount: number | null;
  totalAmount: number;
  status: string;
  dueDate: string;
  paidAt: string | null;
  emailSentAt: string | null;
  createdAt: string | null;
  notes: string | null;
  hasStripePayment: string | null;
  refundedAmount: number;
  disputedAt: string | null;
  amountMismatch: boolean;
  buyerId: string;
  buyerName: string | null;
  buyerEmail: string;
  buyerPaddle: string | null;
  lotId: string;
  lotTitle: string;
  lotNumber: number | null;
  auctionId: string | null;
  auctionTitle: string | null;
}

interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

interface InvoiceStats {
  outstandingCount: number;
  outstandingAmount: number;
  overdueCount: number;
  overdueAmount: number;
  collectedAllTimeCount: number;
  collectedAllTime: number;
  collectedThisMonthCount: number;
  collectedThisMonth: number;
  refundedCount: number;
  refundedAmount: number;
}

interface AuctionOption {
  id: string;
  title: string;
}

type Sort = 'created_desc' | 'due_asc' | 'due_desc';

interface Filters {
  status: string;
  auctionId: string;
  search: string;
  sort: Sort;
}

type PendingAction =
  | { kind: 'paid'; invoice: InvoiceRow }
  | { kind: 'extend'; invoice: InvoiceRow }
  | { kind: 'cancel'; invoice: InvoiceRow }
  | { kind: 'refund'; invoice: InvoiceRow }
  | null;

const EMPTY_STATS: InvoiceStats = {
  outstandingCount: 0, outstandingAmount: 0, overdueCount: 0, overdueAmount: 0,
  collectedAllTimeCount: 0, collectedAllTime: 0, collectedThisMonthCount: 0, collectedThisMonth: 0,
  refundedCount: 0, refundedAmount: 0,
};

const STATUS_CHIPS = ['all', 'pending', 'overdue', 'paid', 'refunded', 'cancelled'] as const;

const statusColors: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  paid: 'bg-green-100 text-green-800',
  overdue: 'bg-red-100 text-red-800',
  cancelled: 'bg-gray-100 text-gray-600',
  refunded: 'bg-blue-100 text-blue-800',
};

const METHODS = [
  { value: 'wire', label: 'Wire transfer' },
  { value: 'check', label: 'Check' },
  { value: 'other', label: 'Other' },
] as const;

/** Parse a fetch response that may not be JSON (proxy errors, HTML 500s). */
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

function fmtDate(d: string | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString();
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function buyerLabel(inv: InvoiceRow): string {
  return inv.buyerName ? `${inv.buyerName} (${inv.buyerEmail})` : inv.buyerEmail;
}

export default function AdminInvoicesPage() {
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, pageSize: 50, total: 0, totalPages: 0 });
  const [stats, setStats] = useState<InvoiceStats>(EMPTY_STATS);
  const [auctions, setAuctions] = useState<AuctionOption[]>([]);
  const [filters, setFilters] = useState<Filters>({ status: 'all', auctionId: 'all', search: '', sort: 'created_desc' });
  const [searchInput, setSearchInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingAction>(null);
  // Filters can arrive in the URL (the inbox, users, webhooks, shipments,
  // payouts and settlement pages link here with ?q= / ?status=). Read them
  // once on mount, then fetch — avoids a hydration mismatch and a wasted
  // unfiltered request.
  const [ready, setReady] = useState(false);

  // Action form state (shared across the dialogs; reset when one opens)
  const [method, setMethod] = useState<(typeof METHODS)[number]['value']>('wire');
  const [reference, setReference] = useState('');
  const [paidAt, setPaidAt] = useState(todayIso());
  const [dueDate, setDueDate] = useState('');
  const [reason, setReason] = useState('');

  const buildParams = useCallback((page: number, f: Filters) => {
    const params = new URLSearchParams({ page: String(page) });
    if (f.status !== 'all') params.set('status', f.status);
    if (f.auctionId !== 'all') params.set('auctionId', f.auctionId);
    if (f.search) params.set('q', f.search);
    if (f.sort !== 'created_desc') params.set('sort', f.sort);
    return params;
  }, []);

  const fetchInvoices = useCallback(async (page: number, f: Filters, silent = false) => {
    if (!silent) setLoading(true);
    setLoadError(false);
    try {
      const res = await fetch(`/api/admin/invoices?${buildParams(page, f)}`);
      const body = await readBody(res);
      if (!res.ok || !body) throw new Error(errorMessage(res, body, 'Failed to load invoices'));
      setInvoices((body.data as InvoiceRow[]) ?? []);
      if (body.pagination) setPagination(body.pagination as Pagination);
      if (body.stats) setStats(body.stats as InvoiceStats);
      if (body.auctions) setAuctions(body.auctions as AuctionOption[]);
    } catch (err) {
      setLoadError(true);
      toast.error(err instanceof Error ? err.message : 'Failed to load invoices');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [buildParams]);

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const status = sp.get('status');
    const auctionId = sp.get('auctionId');
    const search = (sp.get('q') ?? sp.get('search'))?.trim() ?? '';
    const sort = sp.get('sort');
    setFilters({
      status: status && (STATUS_CHIPS as readonly string[]).includes(status) ? status : 'all',
      auctionId: auctionId || 'all',
      search,
      sort: sort === 'due_asc' || sort === 'due_desc' ? sort : 'created_desc',
    });
    setSearchInput(search);
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    fetchInvoices(pagination.page, filters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, pagination.page, filters]);

  // Debounced search box → filters.search
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
    setReason('');
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);
    setDueDate(nextWeek.toISOString().slice(0, 10));
    setPending(action);
  }

  /** PATCH helper — throws on failure (so ConfirmDialog stays open) after toasting. */
  async function patchInvoice(id: string, payload: Record<string, unknown>): Promise<Record<string, unknown> | null> {
    setBusyId(id);
    try {
      const res = await fetch('/api/admin/invoices', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...payload }),
      });
      const body = await readBody(res);
      if (!res.ok) {
        const msg = errorMessage(res, body, 'Update failed');
        toast.error(msg);
        throw new Error(msg);
      }
      if (res.status === 202) {
        toast.info(typeof body?.message === 'string' ? body.message : 'Refund requested; the invoice updates when Stripe confirms.');
      }
      await fetchInvoices(pagination.page, filters, true);
      return body;
    } finally {
      setBusyId(null);
    }
  }

  async function copyPayLink(inv: InvoiceRow) {
    const url = `${window.location.origin}/invoices/${inv.accessToken}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success(`Pay link for ${inv.invoiceNumber} copied`);
    } catch {
      toast.error('Could not copy — your browser blocked clipboard access');
    }
  }

  async function copyText(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied`);
    } catch {
      toast.error('Could not copy — your browser blocked clipboard access');
    }
  }

  async function resendEmail(inv: InvoiceRow) {
    setBusyId(inv.id);
    try {
      const res = await fetch(`/api/admin/invoices/${inv.id}/resend`, { method: 'POST' });
      const body = await readBody(res);
      if (!res.ok) {
        toast.error(errorMessage(res, body, 'Resend failed'));
        return;
      }
      toast.success(`Invoice ${inv.invoiceNumber} re-sent to ${inv.buyerEmail}`);
      const sentAt = (body?.data as { emailSentAt?: string } | undefined)?.emailSentAt ?? new Date().toISOString();
      setInvoices((prev) => prev.map((row) => (row.id === inv.id ? { ...row, emailSentAt: sentAt } : row)));
    } catch {
      toast.error('Network error');
    } finally {
      setBusyId(null);
    }
  }

  const exportUrl = `/api/admin/invoices/export.csv?${buildParams(1, filters)}`;
  const isPayable = (s: string) => s === 'pending' || s === 'overdue';

  return (
    <div>
      <PageHeader title="Invoices" description={`${pagination.total} matching`}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <StatTile label="Outstanding" value={formatCurrencyWithCents(stats.outstandingAmount)} sub={`${stats.outstandingCount} open`} dot="bg-yellow-500" />
          <StatTile label="Overdue" value={formatCurrencyWithCents(stats.overdueAmount)} sub={`${stats.overdueCount} overdue`} dot="bg-red-500" />
          <StatTile label="Collected this month" value={formatCurrencyWithCents(stats.collectedThisMonth)} sub={`${stats.collectedThisMonthCount} paid`} dot="bg-green-500" />
          <StatTile label="Collected all time" value={formatCurrencyWithCents(stats.collectedAllTime)} sub={`${stats.collectedAllTimeCount} paid · ${stats.refundedCount} refunded`} dot="bg-emerald-700" />
        </div>
      </PageHeader>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {STATUS_CHIPS.map((s) => (
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
            {s === 'overdue' && stats.overdueCount > 0 && (
              <span className="ml-1 text-[10px] opacity-70">({stats.overdueCount})</span>
            )}
          </button>
        ))}
        <div className="relative min-w-[220px] flex-1 sm:flex-none">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Invoice #, buyer email, lot title"
            className="h-8 pl-8 text-xs"
          />
        </div>
        <Select value={filters.auctionId} onValueChange={(v) => updateFilters({ auctionId: v })}>
          <SelectTrigger size="sm" className="text-xs min-w-[180px]">
            <SelectValue placeholder="All sales" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sales</SelectItem>
            {auctions.map((a) => (
              <SelectItem key={a.id} value={a.id}>{a.title}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 text-xs"
          onClick={() => updateFilters({ sort: filters.sort === 'due_asc' ? 'due_desc' : filters.sort === 'due_desc' ? 'created_desc' : 'due_asc' })}
          title="Toggle sort: newest / due date ascending / due date descending"
        >
          <ArrowUpDown className="h-3.5 w-3.5" />
          {filters.sort === 'due_asc' ? 'Due ↑' : filters.sort === 'due_desc' ? 'Due ↓' : 'Newest'}
        </Button>
        <Button asChild variant="outline" size="sm" className="gap-1.5 text-xs">
          <a href={exportUrl}>
            <Download className="h-3.5 w-3.5" /> CSV
          </a>
        </Button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-12 bg-muted animate-pulse rounded" />
          ))}
        </div>
      ) : loadError ? (
        <div className="text-center py-16 text-muted-foreground">
          <p>Failed to load invoices.</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => fetchInvoices(pagination.page, filters)}>
            Retry
          </Button>
        </div>
      ) : (
        <>
        <div className="border rounded-lg overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice #</TableHead>
                <TableHead>Buyer</TableHead>
                <TableHead>Lot</TableHead>
                <TableHead>Sale</TableHead>
                <TableHead className="text-right">Hammer</TableHead>
                <TableHead className="text-right">Premium</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Due</TableHead>
                <TableHead>Paid at</TableHead>
                <TableHead>Email</TableHead>
                <TableHead className="w-[60px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.map((invoice) => (
                <TableRow key={invoice.id}>
                  <TableCell className="font-mono text-xs whitespace-nowrap">
                    <span className="inline-flex items-center gap-1">
                      {invoice.invoiceNumber}
                      <button
                        type="button"
                        title="Copy invoice number"
                        onClick={() => copyText(invoice.invoiceNumber, 'Invoice number')}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <Copy className="h-3 w-3" />
                      </button>
                    </span>
                    {invoice.hasStripePayment && (
                      <div className="text-[10px] text-muted-foreground font-sans">via Stripe</div>
                    )}
                  </TableCell>
                  <TableCell>
                    <Link href={`/admin/users/${invoice.buyerId}`} className="hover:underline">
                      {invoice.buyerName || '—'}
                    </Link>
                    <div className="text-xs text-muted-foreground">
                      {invoice.buyerEmail}
                      {invoice.buyerPaddle && <span className="ml-1">· #{invoice.buyerPaddle}</span>}
                    </div>
                  </TableCell>
                  <TableCell className="max-w-[220px]">
                    <Link href={`/admin/lots/${invoice.lotId}`} className="hover:underline block truncate" title={invoice.lotTitle}>
                      {invoice.lotNumber != null && <span className="text-muted-foreground mr-1">#{invoice.lotNumber}</span>}
                      {invoice.lotTitle}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground max-w-[160px] truncate" title={invoice.auctionTitle ?? ''}>
                    {invoice.auctionId ? (
                      <Link href={`/admin/auctions/${invoice.auctionId}`} className="hover:underline">
                        {invoice.auctionTitle}
                      </Link>
                    ) : '—'}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatCurrencyWithCents(invoice.hammerPrice)}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">{formatCurrencyWithCents(invoice.buyerPremium)}</TableCell>
                  <TableCell className="text-right tabular-nums font-medium">{formatCurrencyWithCents(invoice.totalAmount)}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-1">
                      <Badge className={statusColors[invoice.status] || ''}>{invoice.status}</Badge>
                      {invoice.disputedAt && (
                        <Badge
                          className="bg-red-100 text-red-800"
                          title={`Chargeback opened ${new Date(invoice.disputedAt).toLocaleDateString()} — hold shipment, see notes`}
                        >
                          Disputed
                        </Badge>
                      )}
                      {invoice.refundedAmount > 0 && invoice.status !== 'refunded' && (
                        <Badge className="bg-amber-100 text-amber-800" title="Part of the Stripe charge was refunded; the sale stands">
                          Partially refunded {formatCurrencyWithCents(invoice.refundedAmount)}
                        </Badge>
                      )}
                      {invoice.amountMismatch && (
                        <Badge
                          className="bg-red-100 text-red-800"
                          title="A successful payment was for a different amount than the invoice total — see notes"
                        >
                          Reconcile
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className={invoice.status === 'overdue' ? 'text-red-600 font-medium' : 'text-muted-foreground'}>
                    {fmtDate(invoice.dueDate)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{fmtDate(invoice.paidAt)}</TableCell>
                  <TableCell>
                    {invoice.emailSentAt ? (
                      <span className="inline-flex items-center gap-1 text-xs text-green-700" title={`Sent ${new Date(invoice.emailSentAt).toLocaleString()}`}>
                        <CheckCircle className="h-3.5 w-3.5" /> Sent
                      </span>
                    ) : isPayable(invoice.status) ? (
                      <span className="inline-flex items-center gap-1 text-xs text-red-600" title="No invoice email has gone out">
                        <XCircle className="h-3.5 w-3.5" /> Not sent
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {busyId === invoice.id ? (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    ) : (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-xs" title="Actions">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => copyPayLink(invoice)}>
                            <Link2 className="h-3.5 w-3.5" /> Copy pay link
                          </DropdownMenuItem>
                          {isPayable(invoice.status) && (
                            <DropdownMenuItem onClick={() => resendEmail(invoice)}>
                              <Mail className="h-3.5 w-3.5" /> Resend invoice email
                            </DropdownMenuItem>
                          )}
                          {(isPayable(invoice.status) || invoice.status === 'paid') && <DropdownMenuSeparator />}
                          {isPayable(invoice.status) && (
                            <DropdownMenuItem onClick={() => openAction({ kind: 'paid', invoice })}>
                              <CheckCircle className="h-3.5 w-3.5 text-green-600" /> Mark paid (wire/check)
                            </DropdownMenuItem>
                          )}
                          {isPayable(invoice.status) && (
                            <DropdownMenuItem onClick={() => openAction({ kind: 'extend', invoice })}>
                              <CalendarPlus className="h-3.5 w-3.5" /> {invoice.status === 'overdue' ? 'Extend due date' : 'Change due date'}
                            </DropdownMenuItem>
                          )}
                          {isPayable(invoice.status) && (
                            <DropdownMenuItem variant="destructive" onClick={() => openAction({ kind: 'cancel', invoice })}>
                              <XCircle className="h-3.5 w-3.5" /> Cancel invoice
                            </DropdownMenuItem>
                          )}
                          {invoice.status === 'paid' && (
                            <DropdownMenuItem variant="destructive" onClick={() => openAction({ kind: 'refund', invoice })}>
                              <RotateCcw className="h-3.5 w-3.5" /> Refund
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {invoices.length === 0 && (
                <TableRow>
                  <TableCell colSpan={12} className="text-center text-muted-foreground py-8">
                    {filters.status === 'all' && !filters.search && filters.auctionId === 'all'
                      ? 'No invoices yet.'
                      : 'No invoices match these filters.'}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

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
        </>
      )}

      {/* Mark paid */}
      <ConfirmDialog
        open={pending?.kind === 'paid'}
        onOpenChange={(open) => !open && setPending(null)}
        title="Record a manual payment"
        confirmLabel="Mark paid"
        onConfirm={async () => {
          if (!pending) return;
          await patchInvoice(pending.invoice.id, { status: 'paid', method, reference: reference || undefined, paidAt: paidAt || undefined });
          toast.success(`${pending.invoice.invoiceNumber} marked paid`);
        }}
        description={pending && (
          <div className="space-y-3 text-sm">
            <p>
              Record <strong>{formatCurrencyWithCents(pending.invoice.totalAmount)}</strong> received from{' '}
              <strong>{buyerLabel(pending.invoice)}</strong> for {pending.invoice.invoiceNumber} ({pending.invoice.lotTitle}).
              This creates the consignor payout, the shipment, and emails the buyer a receipt.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Method</Label>
                <Select value={method} onValueChange={(v) => setMethod(v as typeof method)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {METHODS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="paidAt">Received on</Label>
                <Input id="paidAt" type="date" value={paidAt} max={todayIso()} onChange={(e) => setPaidAt(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reference">Reference (wire ID / check #)</Label>
              <Input id="reference" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Optional" />
            </div>
          </div>
        )}
      />

      {/* Extend */}
      <ConfirmDialog
        open={pending?.kind === 'extend'}
        onOpenChange={(open) => !open && setPending(null)}
        title={pending?.invoice.status === 'overdue' ? 'Extend invoice' : 'Change due date'}
        confirmLabel={pending?.invoice.status === 'overdue' ? 'Extend' : 'Save'}
        onConfirm={async () => {
          if (!pending) return;
          const payload = pending.invoice.status === 'overdue'
            ? { status: 'pending', dueDate: new Date(`${dueDate}T23:59:59`).toISOString() }
            : { dueDate: new Date(`${dueDate}T23:59:59`).toISOString() };
          await patchInvoice(pending.invoice.id, payload);
          toast.success(`${pending.invoice.invoiceNumber} now due ${new Date(dueDate).toLocaleDateString()}`);
        }}
        description={pending && (
          <div className="space-y-3 text-sm">
            <p>
              {pending.invoice.invoiceNumber} — <strong>{formatCurrencyWithCents(pending.invoice.totalAmount)}</strong> from{' '}
              <strong>{buyerLabel(pending.invoice)}</strong>, currently due {fmtDate(pending.invoice.dueDate)}.
              {pending.invoice.status === 'overdue' && ' Extending moves it back to pending.'}
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="dueDate">New due date</Label>
              <Input id="dueDate" type="date" value={dueDate} min={todayIso()} onChange={(e) => setDueDate(e.target.value)} />
            </div>
          </div>
        )}
      />

      {/* Cancel */}
      <ConfirmDialog
        open={pending?.kind === 'cancel'}
        onOpenChange={(open) => !open && setPending(null)}
        title="Cancel invoice"
        confirmLabel="Cancel invoice"
        cancelLabel="Keep it"
        variant="destructive"
        onConfirm={async () => {
          if (!pending) return;
          await patchInvoice(pending.invoice.id, { status: 'cancelled', reason: reason || undefined });
          toast.success(`${pending.invoice.invoiceNumber} cancelled — lot released`);
        }}
        description={pending && (
          <div className="space-y-3 text-sm">
            <p>
              Void {pending.invoice.invoiceNumber} for <strong>{formatCurrencyWithCents(pending.invoice.totalAmount)}</strong> owed by{' '}
              <strong>{buyerLabel(pending.invoice)}</strong>. Any open Stripe checkout is expired and{' '}
              <em>{pending.invoice.lotTitle}</em> is relisted in the gallery (or marked unsold).
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="reason">Reason (internal)</Label>
              <Input id="reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. buyer backed out" />
            </div>
          </div>
        )}
      />

      {/* Refund */}
      <ConfirmDialog
        open={pending?.kind === 'refund'}
        onOpenChange={(open) => !open && setPending(null)}
        title="Refund invoice"
        confirmLabel={pending?.invoice.hasStripePayment ? 'Refund via Stripe' : 'Record refund'}
        variant="destructive"
        onConfirm={async () => {
          if (!pending) return;
          const body = await patchInvoice(pending.invoice.id, { status: 'refunded', reason: reason || undefined });
          if (body && (body.data as { status?: string } | undefined)?.status === 'refunded') {
            toast.success(`${pending.invoice.invoiceNumber} refunded — sale unwound`);
          }
        }}
        description={pending && (
          <div className="space-y-3 text-sm">
            <p>
              Refund <strong>{formatCurrencyWithCents(pending.invoice.totalAmount)}</strong> to{' '}
              <strong>{buyerLabel(pending.invoice)}</strong> for {pending.invoice.invoiceNumber} ({pending.invoice.lotTitle}).
            </p>
            {pending.invoice.hasStripePayment ? (
              <p className="text-muted-foreground">
                The card payment is refunded through Stripe. The invoice, lot, consignor payout and shipment update when Stripe confirms (usually within a minute).
              </p>
            ) : (
              <p className="text-muted-foreground">
                This was a wire/check payment — send the money back yourself, then confirm here. The lot is released, the consignor payout cancelled (or flagged for clawback if already paid), open shipments cancelled, and the buyer emailed.
              </p>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="refundReason">Reason (internal)</Label>
              <Input id="refundReason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. item not as described" />
            </div>
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
