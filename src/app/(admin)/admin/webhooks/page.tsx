'use client';

import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import {
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  CheckCircle,
  XCircle,
  MinusCircle,
  Loader2,
  Webhook,
  ChevronDown,
  ChevronUp,
  Search,
  X,
  CornerDownRight,
  ExternalLink,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface WebhookLog {
  id: string;
  provider: string;
  eventType: string;
  eventId: string | null;
  status: string;
  errorMessage: string | null;
  processingMs: number | null;
  payload: Record<string, unknown> | null;
  relatedType: string | null;
  relatedId: string | null;
  replayCount: number;
  lastReplayedAt: string | null;
  replayOfId: string | null;
  createdAt: string;
  replays: WebhookLog[];
}

interface Stats {
  total: number;
  success: number;
  failed: number;
  failed_resolved: number;
  ignored: number;
  processing: number;
  failed_today: number;
}

interface EventTypeOption {
  provider: string;
  eventType: string;
}

interface Filters {
  provider: string;
  status: string;
  eventType: string;
  q: string;
}

const EMPTY_FILTERS: Filters = { provider: '', status: '', eventType: '', q: '' };
const PAGE_SIZE = 50;
const AUTO_REFRESH_MS = 30_000;

const statusConfig: Record<string, { label: string; icon: typeof CheckCircle; className: string }> = {
  success: { label: 'Success', icon: CheckCircle, className: 'text-emerald-600 bg-emerald-50' },
  failed: { label: 'Failed', icon: XCircle, className: 'text-red-600 bg-red-50' },
  ignored: { label: 'Ignored', icon: MinusCircle, className: 'text-gray-500 bg-gray-100' },
  processing: { label: 'Processing', icon: Loader2, className: 'text-amber-700 bg-amber-50' },
};

const providerConfig: Record<string, { label: string; className: string }> = {
  stripe: { label: 'Stripe', className: 'bg-violet-100 text-violet-700' },
  resend: { label: 'Resend', className: 'bg-blue-100 text-blue-700' },
};

/** Where a related entity lives in the admin. Unknown types render as text. */
const RELATED_LINKS: Record<string, (id: string) => string> = {
  invoice: (id) => `/admin/invoices?q=${encodeURIComponent(id)}`,
  email: (id) => `/admin/emails?thread=${encodeURIComponent(id)}`,
  user: (id) => `/admin/users/${encodeURIComponent(id)}`,
  lot: (id) => `/admin/lots/${encodeURIComponent(id)}`,
};

/**
 * What the replay route will actually do for this event — mirrors the branch
 * table in src/lib/stripe/handlers.ts and src/lib/email/resend-events.ts so
 * the admin is confirming a concrete action, not "re-run something".
 */
function describeReplay(log: WebhookLog): string {
  if (log.provider === 'stripe') {
    switch (log.eventType) {
      case 'payment_intent.succeeded':
      case 'checkout.session.completed':
        return 'Re-runs the payment handler: verifies the paid amount and currency against the invoice, marks the invoice paid if it is still payable, and creates the seller payout and shipment if they do not exist yet. An invoice that is already paid is left untouched.';
      case 'payment_intent.payment_failed':
        return 'Re-runs the failed-payment handler: records the failure reason on the payment record. The invoice stays payable.';
      case 'charge.refunded':
        return 'Re-runs the refund handler: a full refund marks the invoice and payment refunded and returns the lot to unsold; a partial refund is recorded without changing the sale.';
      case 'charge.dispute.created':
      case 'charge.dispute.closed':
        return 'Re-runs the dispute handler: records the dispute state on the related invoice/payment.';
      case 'identity.verification_session.verified':
        return 'Re-runs the identity handler: marks the bidder identity-verified (raising their bid ceiling). Only acts on our own bidder-identity sessions and never overwrites an earlier verification.';
      default:
        return `There is no handler for "${log.eventType}" — the replay will run through the Stripe dispatcher and be recorded as ignored.`;
    }
  }
  if (log.provider === 'resend') {
    const emailId = typeof log.payload?.data === 'object' && log.payload?.data
      ? String((log.payload.data as Record<string, unknown>).email_id ?? '')
      : '';
    const target = emailId ? `the outbound email with Resend id ${emailId}` : 'the outbound email in the payload';
    switch (log.eventType) {
      case 'email.delivered':
        return `Marks ${target} as delivered in the inbox.`;
      case 'email.bounced':
        return `Marks ${target} as bounced in the inbox.`;
      case 'email.received':
        return 'Inbound mail cannot be replayed — it would create a duplicate email record. The server will refuse this.';
      default:
        return `There is no handler for "${log.eventType}" — the replay will be recorded as ignored.`;
    }
  }
  return 'Re-runs the handler with the stored payload.';
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

function StatusPill({ status }: { status: string }) {
  const sc = statusConfig[status];
  const Icon = sc?.icon ?? MinusCircle;
  return (
    <span className={cn('inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium', sc?.className ?? 'bg-muted text-muted-foreground')}>
      <Icon className={cn('h-3 w-3', status === 'processing' && 'animate-spin')} />
      {sc?.label ?? status}
    </span>
  );
}

function RelatedLink({ type, id, full }: { type: string | null; id: string | null; full?: boolean }) {
  if (!type || !id) return <span>—</span>;
  const label = full ? `${type}: ${id}` : `${type}/${id.slice(0, 8)}…`;
  const href = RELATED_LINKS[type]?.(id);
  if (!href) return <span className="font-mono">{label}</span>;
  return (
    <Link
      href={href}
      onClick={(e) => e.stopPropagation()}
      className="font-mono inline-flex items-center gap-1 underline decoration-dotted underline-offset-2 hover:text-foreground"
      title={`${type}: ${id}`}
    >
      {label}
      <ExternalLink className="h-3 w-3 opacity-60" />
    </Link>
  );
}

export default function AdminWebhooksPage() {
  const [logs, setLogs] = useState<WebhookLog[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [eventTypes, setEventTypes] = useState<EventTypeOption[]>([]);
  const [loading, setLoading] = useState(true);       // first load — skeleton
  const [refreshing, setRefreshing] = useState(false); // filter change / refresh — keep the table, dim it
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [qInput, setQInput] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [payloadOpen, setPayloadOpen] = useState<Set<string>>(new Set());
  const [replayTarget, setReplayTarget] = useState<WebhookLog | null>(null);
  const [replayingId, setReplayingId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  // Latest request wins: a slow response for an old filter must not overwrite
  // the result of a newer one.
  const requestSeq = useRef(0);

  const fetchLogs = useCallback(async (pageOffset: number, f: Filters, opts: { silent?: boolean } = {}) => {
    const seq = ++requestSeq.current;
    if (!opts.silent) setRefreshing(true);
    try {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(pageOffset) });
      if (f.provider) params.set('provider', f.provider);
      if (f.status) params.set('status', f.status);
      if (f.eventType) params.set('eventType', f.eventType);
      if (f.q) params.set('q', f.q);

      const res = await fetch(`/api/admin/webhooks?${params}`);
      const data = await res.json().catch(() => ({}));
      if (seq !== requestSeq.current) return;
      if (!res.ok) throw new Error(data.error || 'Failed to load webhook logs');
      setLoadError(null);
      setLogs(data.data ?? []);
      setTotal(data.pagination?.total ?? 0);
      if (data.stats) setStats(data.stats as Stats);
      if (data.eventTypes) setEventTypes(data.eventTypes as EventTypeOption[]);
      setLastRefreshed(new Date());
    } catch (err) {
      if (seq !== requestSeq.current) return;
      const message = err instanceof Error ? err.message : 'Failed to load webhook logs';
      setLoadError(message);
      if (!opts.silent) toast.error(message);
    } finally {
      if (seq === requestSeq.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  // Initial load honours deep links from the dashboard / sidebar badge
  // (e.g. /admin/webhooks?status=failed). Read from window rather than
  // useSearchParams so the page needs no Suspense boundary.
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const initial: Filters = {
      provider: sp.get('provider') ?? '',
      status: sp.get('status') ?? '',
      eventType: sp.get('eventType') ?? '',
      q: sp.get('q') ?? '',
    };
    setFilters(initial);
    setQInput(initial.q);
    fetchLogs(0, initial);
  }, [fetchLogs]);

  // Auto-refresh: silent so the table doesn't flicker every 30s.
  useEffect(() => {
    if (!autoRefresh) return;
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') fetchLogs(offset, filters, { silent: true });
    }, AUTO_REFRESH_MS);
    return () => clearInterval(timer);
  }, [autoRefresh, offset, filters, fetchLogs]);

  function applyFilters(next: Partial<Filters>) {
    const merged = { ...filters, ...next };
    // Event types are per provider; switching provider drops a type it doesn't have.
    if (next.provider !== undefined && merged.eventType) {
      const stillValid = eventTypes.some((t) => t.eventType === merged.eventType && (!merged.provider || t.provider === merged.provider));
      if (!stillValid) merged.eventType = '';
    }
    setFilters(merged);
    setOffset(0);
    setExpandedId(null);
    fetchLogs(0, merged);
  }

  function goToPage(nextOffset: number) {
    setOffset(nextOffset);
    setExpandedId(null);
    fetchLogs(nextOffset, filters);
  }

  function clearFilters() {
    setQInput('');
    applyFilters(EMPTY_FILTERS);
  }

  async function confirmReplay() {
    const log = replayTarget;
    if (!log) return;
    setReplayingId(log.id);
    try {
      const res = await fetch(`/api/admin/webhooks/${log.id}/replay`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || 'Replay failed');
      } else if (data.status === 'failed') {
        toast.error(`Replay ran but failed: ${data.errorMessage || 'see the new entry'}`);
      } else {
        toast.success(`Replayed — ${data.status}`);
      }
      fetchLogs(offset, filters, { silent: true });
    } catch {
      toast.error('Replay request failed');
    } finally {
      setReplayingId(null);
    }
  }

  function togglePayload(id: string) {
    setPayloadOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const hasFilters = Boolean(filters.provider || filters.status || filters.eventType || filters.q);
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;
  const visibleEventTypes = eventTypes.filter((t) => !filters.provider || t.provider === filters.provider);

  const statCard = (label: string, value: number | undefined, onClick: () => void, opts: { className?: string; active?: boolean; sub?: React.ReactNode } = {}) => (
    <Card
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
      className={cn('cursor-pointer hover:bg-accent/5 transition-colors', opts.active && 'ring-1 ring-foreground/40')}
    >
      <CardContent className="py-3 px-4">
        <p className="text-xs text-muted-foreground mb-1">{label}</p>
        <p className={cn('text-2xl font-display', opts.className)}>{(value ?? 0).toLocaleString()}</p>
        {opts.sub}
      </CardContent>
    </Card>
  );

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="font-display text-display-sm">Webhook Logs</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Stripe and Resend webhook event history with replay
            {filters.provider && <> · showing {providerConfig[filters.provider]?.label ?? filters.provider} only</>}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
            <button
              type="button"
              role="switch"
              aria-checked={autoRefresh}
              onClick={() => setAutoRefresh((v) => !v)}
              className={cn(
                'relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors',
                autoRefresh ? 'bg-champagne' : 'bg-muted',
              )}
            >
              <span className={cn('pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transition-transform', autoRefresh ? 'translate-x-4' : 'translate-x-0')} />
            </button>
            Auto-refresh (30s)
          </label>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchLogs(offset, filters)}
            disabled={refreshing}
            className="gap-2"
            title={lastRefreshed ? `Last refreshed ${lastRefreshed.toLocaleTimeString()}` : undefined}
          >
            <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Stats — clicks keep the current provider filter */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {statCard('Total', stats.total, () => applyFilters({ status: '' }), { active: !filters.status && hasFilters })}
          {statCard('Succeeded', stats.success, () => applyFilters({ status: 'success' }), { className: 'text-emerald-600', active: filters.status === 'success' })}
          {statCard('Failed', stats.failed, () => applyFilters({ status: 'failed' }), {
            className: 'text-red-600',
            active: filters.status === 'failed',
            sub: (
              <>
                {stats.failed_today > 0 && <p className="text-xs text-red-500 mt-0.5">{stats.failed_today} in the last 24h</p>}
                {stats.failed_resolved > 0 && <p className="text-xs text-muted-foreground mt-0.5">+{stats.failed_resolved} fixed by replay</p>}
              </>
            ),
          })}
          {statCard('Ignored', stats.ignored, () => applyFilters({ status: 'ignored' }), {
            className: 'text-muted-foreground',
            active: filters.status === 'ignored',
            sub: stats.processing > 0 && <p className="text-xs text-amber-700 mt-0.5">{stats.processing} processing</p>,
          })}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {(['', 'stripe', 'resend'] as const).map((p) => (
          <button
            key={p || 'all-provider'}
            onClick={() => applyFilters({ provider: p })}
            className={cn(
              'px-3 py-1.5 rounded-md text-xs font-medium transition-colors border',
              filters.provider === p
                ? 'bg-foreground text-background border-foreground'
                : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/50',
            )}
          >
            {p ? (providerConfig[p]?.label ?? p) : 'All providers'}
          </button>
        ))}
        <div className="w-px h-5 bg-border mx-1 hidden sm:block" />
        {(['', 'success', 'failed', 'ignored'] as const).map((s) => (
          <button
            key={s || 'all-status'}
            onClick={() => applyFilters({ status: s })}
            className={cn(
              'px-3 py-1.5 rounded-md text-xs font-medium transition-colors border',
              filters.status === s
                ? 'bg-foreground text-background border-foreground'
                : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/50',
            )}
          >
            {s ? (statusConfig[s]?.label ?? s) : 'All statuses'}
          </button>
        ))}
        <div className="w-px h-5 bg-border mx-1 hidden sm:block" />
        <select
          value={filters.eventType}
          onChange={(e) => applyFilters({ eventType: e.target.value })}
          className="text-xs border border-border rounded-md px-2 py-1.5 bg-background font-mono max-w-[240px]"
          aria-label="Event type"
        >
          <option value="">All event types</option>
          {visibleEventTypes.map((t) => (
            <option key={`${t.provider}:${t.eventType}`} value={t.eventType}>
              {filters.provider ? t.eventType : `${t.eventType} (${providerConfig[t.provider]?.label ?? t.provider})`}
            </option>
          ))}
        </select>
        <form
          className="flex items-center gap-1"
          onSubmit={(e) => { e.preventDefault(); applyFilters({ q: qInput.trim() }); }}
        >
          <div className="relative">
            <Search className="h-3.5 w-3.5 text-muted-foreground absolute left-2 top-1/2 -translate-y-1/2" />
            <input
              value={qInput}
              onChange={(e) => setQInput(e.target.value)}
              placeholder="Event id or related id"
              className="text-xs border border-border rounded-md pl-7 pr-7 py-1.5 bg-background w-[200px] font-mono"
              aria-label="Search by event id or related id"
            />
            {qInput && (
              <button
                type="button"
                onClick={() => { setQInput(''); if (filters.q) applyFilters({ q: '' }); }}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <Button type="submit" size="sm" variant="outline" className="h-[30px] text-xs">Search</Button>
        </form>
        {refreshing && !loading && (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground ml-1">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Updating…
          </span>
        )}
        {hasFilters && !refreshing && (
          <button onClick={clearFilters} className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground ml-1">
            Clear filters
          </button>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-12 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
      ) : loadError && logs.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <XCircle className="h-10 w-10 text-red-500 mx-auto mb-3" />
            <p className="text-muted-foreground mb-1">Failed to load webhook logs.</p>
            <p className="text-xs text-muted-foreground mb-4">{loadError}</p>
            <Button variant="outline" size="sm" onClick={() => fetchLogs(offset, filters)}>
              Try again
            </Button>
          </CardContent>
        </Card>
      ) : logs.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Webhook className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            {hasFilters || (stats && stats.total > 0) ? (
              <>
                <p className="text-muted-foreground">No events match these filters.</p>
                <Button variant="outline" size="sm" className="mt-4" onClick={clearFilters}>
                  Clear filters
                </Button>
              </>
            ) : (
              <>
                <p className="text-muted-foreground">No webhook events yet.</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Events will appear here once Stripe or Resend webhooks fire.
                </p>
              </>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className={cn('border rounded-lg overflow-x-auto transition-opacity', refreshing && 'opacity-60 pointer-events-none')} aria-busy={refreshing}>
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="bg-muted/50 text-left border-b">
                <th className="px-4 py-2.5 font-medium text-xs text-muted-foreground">Status</th>
                <th className="px-4 py-2.5 font-medium text-xs text-muted-foreground">Provider</th>
                <th className="px-4 py-2.5 font-medium text-xs text-muted-foreground">Event</th>
                <th className="px-4 py-2.5 font-medium text-xs text-muted-foreground hidden sm:table-cell">Related</th>
                <th className="px-4 py-2.5 font-medium text-xs text-muted-foreground hidden md:table-cell">Duration</th>
                <th className="px-4 py-2.5 font-medium text-xs text-muted-foreground">Time</th>
                <th className="px-4 py-2.5 font-medium text-xs text-muted-foreground w-[48px]"></th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => {
                const pc = providerConfig[log.provider];
                const isExpanded = expandedId === log.id;
                const latestReplay = log.replays[0];
                const resolvedByReplay = log.status === 'failed' && latestReplay?.status === 'success';
                const canReplay = log.status !== 'ignored' && log.status !== 'processing';
                const showPayload = payloadOpen.has(log.id);

                return (
                  <Fragment key={log.id}>
                    <tr
                      className={cn(
                        'border-t hover:bg-accent/5 transition-colors cursor-pointer',
                        isExpanded && 'bg-accent/5',
                      )}
                      onClick={() => setExpandedId(isExpanded ? null : log.id)}
                    >
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <StatusPill status={log.status} />
                          {resolvedByReplay && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-50 text-emerald-700" title="A later replay of this event succeeded">
                              fixed by replay
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn('inline-flex px-2 py-0.5 rounded text-xs font-medium', pc?.className)}>
                          {pc?.label ?? log.provider}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs">{log.eventType}</span>
                        {log.replays.length > 0 && (
                          <span className="ml-2 text-xs text-muted-foreground">
                            replayed ×{log.replays.length}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell text-muted-foreground text-xs">
                        <RelatedLink type={log.relatedType} id={log.relatedId} />
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell text-muted-foreground text-xs">
                        {log.processingMs != null ? `${log.processingMs}ms` : '—'}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">
                        {formatTime(log.createdAt)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {isExpanded
                          ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground inline" />
                          : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground inline" />}
                      </td>
                    </tr>

                    {isExpanded && (
                      <tr className="border-t bg-muted/20">
                        <td colSpan={7} className="px-4 py-4">
                          <div className="space-y-3">
                            {log.errorMessage && (
                              <div className="bg-red-50 border border-red-200 rounded p-3">
                                <p className="text-xs font-medium text-red-700 mb-1">Error</p>
                                <p className="text-xs font-mono text-red-600 break-words">{log.errorMessage}</p>
                              </div>
                            )}

                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                              {log.eventId && (
                                <div className="min-w-0">
                                  <p className="text-muted-foreground mb-0.5">Event ID</p>
                                  <p className="font-mono truncate" title={log.eventId}>{log.eventId}</p>
                                </div>
                              )}
                              {log.relatedType && (
                                <div className="min-w-0">
                                  <p className="text-muted-foreground mb-0.5">Related</p>
                                  <p className="truncate"><RelatedLink type={log.relatedType} id={log.relatedId} full /></p>
                                </div>
                              )}
                              <div>
                                <p className="text-muted-foreground mb-0.5">Received</p>
                                <p>{formatTime(log.createdAt)}</p>
                              </div>
                              {log.lastReplayedAt && (
                                <div>
                                  <p className="text-muted-foreground mb-0.5">Last replayed</p>
                                  <p>{formatTime(log.lastReplayedAt)}</p>
                                </div>
                              )}
                            </div>

                            {/* Replays, newest first */}
                            {log.replays.length > 0 && (
                              <div>
                                <p className="text-xs text-muted-foreground mb-1.5">Replays</p>
                                <ul className="space-y-1.5">
                                  {log.replays.map((r, i) => (
                                    <li key={r.id} className="flex flex-wrap items-center gap-2 text-xs rounded border bg-background px-3 py-2">
                                      <CornerDownRight className="h-3 w-3 text-muted-foreground" />
                                      <span className="text-muted-foreground">#{log.replays.length - i}</span>
                                      <StatusPill status={r.status} />
                                      <span className="text-muted-foreground">{formatTime(r.createdAt)}</span>
                                      {r.processingMs != null && <span className="text-muted-foreground">· {r.processingMs}ms</span>}
                                      {r.errorMessage && <span className="font-mono text-red-600 break-all basis-full sm:basis-auto">{r.errorMessage}</span>}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}

                            {/* Payload — collapsed by default */}
                            <div>
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); togglePayload(log.id); }}
                                className="text-xs text-muted-foreground inline-flex items-center gap-1 hover:text-foreground"
                              >
                                {showPayload ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                                {showPayload ? 'Hide payload' : 'Show payload'}
                              </button>
                              {showPayload && (
                                <pre className="mt-1.5 text-xs bg-background border rounded p-3 overflow-x-auto max-h-64 font-mono leading-relaxed">
                                  {JSON.stringify(log.payload, null, 2)}
                                </pre>
                              )}
                            </div>

                            {canReplay && (
                              <div className="flex flex-wrap items-center gap-3">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="gap-2"
                                  disabled={replayingId === log.id}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setReplayTarget(log);
                                  }}
                                >
                                  <RotateCcw className={cn('h-3.5 w-3.5', replayingId === log.id && 'animate-spin')} />
                                  {replayingId === log.id ? 'Replaying…' : 'Replay event'}
                                </Button>
                                <p className="text-xs text-muted-foreground">
                                  Re-runs the handler with the stored payload; the outcome is recorded as a replay under this event.
                                </p>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm">
          <p className="text-muted-foreground">
            Page {currentPage} of {totalPages} · {total.toLocaleString()} events
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={offset === 0 || refreshing}
              onClick={() => goToPage(Math.max(0, offset - PAGE_SIZE))}
              className="gap-1"
            >
              <ChevronLeft className="h-3.5 w-3.5" /> Prev
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={offset + PAGE_SIZE >= total || refreshing}
              onClick={() => goToPage(offset + PAGE_SIZE)}
              className="gap-1"
            >
              Next <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={replayTarget !== null}
        onOpenChange={(open) => { if (!open) setReplayTarget(null); }}
        title={replayTarget ? `Replay ${replayTarget.eventType}?` : 'Replay event?'}
        confirmLabel="Replay"
        description={replayTarget ? (
          <div className="space-y-2 text-sm">
            <p>{describeReplay(replayTarget)}</p>
            <p className="text-xs text-muted-foreground">
              {providerConfig[replayTarget.provider]?.label ?? replayTarget.provider}
              {replayTarget.eventId && <> · <span className="font-mono">{replayTarget.eventId}</span></>}
              {' · '}received {formatTime(replayTarget.createdAt)}
            </p>
          </div>
        ) : undefined}
        onConfirm={confirmReplay}
      />
    </div>
  );
}
