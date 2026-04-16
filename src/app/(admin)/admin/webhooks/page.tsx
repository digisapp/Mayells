'use client';

import { useEffect, useState, useCallback } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  CheckCircle,
  XCircle,
  MinusCircle,
  Webhook,
  ChevronDown,
  ChevronUp,
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
  createdAt: string;
}

interface Stats {
  total: number;
  success: number;
  failed: number;
  ignored: number;
  failed_today: number;
}

const PAGE_SIZE = 50;

const statusConfig = {
  success: { label: 'Success', icon: CheckCircle, className: 'text-emerald-600 bg-emerald-50' },
  failed: { label: 'Failed', icon: XCircle, className: 'text-red-600 bg-red-50' },
  ignored: { label: 'Ignored', icon: MinusCircle, className: 'text-gray-500 bg-gray-100' },
};

const providerConfig = {
  stripe: { label: 'Stripe', className: 'bg-violet-100 text-violet-700' },
  resend: { label: 'Resend', className: 'bg-blue-100 text-blue-700' },
};

export default function AdminWebhooksPage() {
  const [logs, setLogs] = useState<WebhookLog[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [provider, setProvider] = useState<string>('');
  const [status, setStatus] = useState<string>('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [replayingId, setReplayingId] = useState<string | null>(null);

  const fetchLogs = useCallback(async (pageOffset = 0, providerFilter = provider, statusFilter = status) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(pageOffset) });
      if (providerFilter) params.set('provider', providerFilter);
      if (statusFilter) params.set('status', statusFilter);

      const res = await fetch(`/api/admin/webhooks?${params}`);
      const data = await res.json();
      setLogs(data.data ?? []);
      setTotal(data.pagination?.total ?? 0);
      if (data.stats) setStats(data.stats as Stats);
    } catch {
      toast.error('Failed to load webhook logs');
    } finally {
      setLoading(false);
    }
  }, [provider, status]);

  useEffect(() => {
    fetchLogs(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleReplay(log: WebhookLog) {
    setReplayingId(log.id);
    try {
      const res = await fetch(`/api/admin/webhooks/${log.id}/replay`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Replay failed');
      } else {
        toast.success(`Replayed — status: ${data.status}`);
        fetchLogs(offset);
      }
    } catch {
      toast.error('Replay request failed');
    } finally {
      setReplayingId(null);
    }
  }

  function applyFilter(newProvider: string, newStatus: string) {
    setProvider(newProvider);
    setStatus(newStatus);
    setOffset(0);
    fetchLogs(0, newProvider, newStatus);
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-display-sm">Webhook Logs</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Stripe and Resend webhook event history with replay
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => fetchLogs(offset)}
          disabled={loading}
          className="gap-2"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <Card className="cursor-pointer hover:bg-accent/5 transition-colors" onClick={() => applyFilter('', '')}>
            <CardContent className="py-3 px-4">
              <p className="text-xs text-muted-foreground mb-1">Total</p>
              <p className="text-2xl font-display">{stats.total.toLocaleString()}</p>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:bg-accent/5 transition-colors" onClick={() => applyFilter('', 'success')}>
            <CardContent className="py-3 px-4">
              <p className="text-xs text-muted-foreground mb-1">Succeeded</p>
              <p className="text-2xl font-display text-emerald-600">{stats.success.toLocaleString()}</p>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:bg-accent/5 transition-colors" onClick={() => applyFilter('', 'failed')}>
            <CardContent className="py-3 px-4">
              <p className="text-xs text-muted-foreground mb-1">Failed</p>
              <p className="text-2xl font-display text-red-600">{stats.failed.toLocaleString()}</p>
              {stats.failed_today > 0 && (
                <p className="text-xs text-red-500 mt-0.5">{stats.failed_today} today</p>
              )}
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:bg-accent/5 transition-colors" onClick={() => applyFilter('', 'ignored')}>
            <CardContent className="py-3 px-4">
              <p className="text-xs text-muted-foreground mb-1">Ignored</p>
              <p className="text-2xl font-display text-muted-foreground">{stats.ignored.toLocaleString()}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        {(['', 'stripe', 'resend'] as const).map((p) => (
          <button
            key={p || 'all-provider'}
            onClick={() => applyFilter(p, status)}
            className={cn(
              'px-3 py-1.5 rounded-md text-xs font-medium transition-colors border',
              provider === p
                ? 'bg-foreground text-background border-foreground'
                : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/50',
            )}
          >
            {p ? (providerConfig[p as keyof typeof providerConfig]?.label ?? p) : 'All providers'}
          </button>
        ))}
        <div className="w-px bg-border mx-1" />
        {(['', 'success', 'failed', 'ignored'] as const).map((s) => (
          <button
            key={s || 'all-status'}
            onClick={() => applyFilter(provider, s)}
            className={cn(
              'px-3 py-1.5 rounded-md text-xs font-medium transition-colors border',
              status === s
                ? 'bg-foreground text-background border-foreground'
                : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/50',
            )}
          >
            {s ? (statusConfig[s as keyof typeof statusConfig]?.label ?? s) : 'All statuses'}
          </button>
        ))}
      </div>

      {/* Table */}
      {loading && logs.length === 0 ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-12 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
      ) : logs.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Webhook className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">No webhook events yet.</p>
            <p className="text-xs text-muted-foreground mt-1">
              Events will appear here once Stripe or Resend webhooks fire.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 text-left border-b">
                <th className="px-4 py-2.5 font-medium text-xs text-muted-foreground">Status</th>
                <th className="px-4 py-2.5 font-medium text-xs text-muted-foreground">Provider</th>
                <th className="px-4 py-2.5 font-medium text-xs text-muted-foreground">Event</th>
                <th className="px-4 py-2.5 font-medium text-xs text-muted-foreground hidden sm:table-cell">Related</th>
                <th className="px-4 py-2.5 font-medium text-xs text-muted-foreground hidden md:table-cell">Duration</th>
                <th className="px-4 py-2.5 font-medium text-xs text-muted-foreground">Time</th>
                <th className="px-4 py-2.5 font-medium text-xs text-muted-foreground w-[80px]"></th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => {
                const sc = statusConfig[log.status as keyof typeof statusConfig];
                const pc = providerConfig[log.provider as keyof typeof providerConfig];
                const isExpanded = expandedId === log.id;
                const StatusIcon = sc?.icon ?? MinusCircle;

                return (
                  <>
                    <tr
                      key={log.id}
                      className={cn(
                        'border-t hover:bg-accent/5 transition-colors cursor-pointer',
                        isExpanded && 'bg-accent/5',
                      )}
                      onClick={() => setExpandedId(isExpanded ? null : log.id)}
                    >
                      <td className="px-4 py-3">
                        <span className={cn('inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium', sc?.className)}>
                          <StatusIcon className="h-3 w-3" />
                          {sc?.label ?? log.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn('inline-flex px-2 py-0.5 rounded text-xs font-medium', pc?.className)}>
                          {pc?.label ?? log.provider}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs">{log.eventType}</span>
                        {log.replayCount > 0 && (
                          <span className="ml-2 text-xs text-muted-foreground">
                            replayed ×{log.replayCount}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell text-muted-foreground text-xs">
                        {log.relatedType && log.relatedId
                          ? <span className="font-mono">{log.relatedType}/{log.relatedId.slice(0, 8)}…</span>
                          : '—'}
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell text-muted-foreground text-xs">
                        {log.processingMs != null ? `${log.processingMs}ms` : '—'}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">
                        {new Date(log.createdAt).toLocaleString('en-US', {
                          month: 'short', day: 'numeric',
                          hour: 'numeric', minute: '2-digit',
                        })}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {isExpanded
                          ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground inline" />
                          : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground inline" />}
                      </td>
                    </tr>

                    {isExpanded && (
                      <tr key={`${log.id}-detail`} className="border-t bg-muted/20">
                        <td colSpan={7} className="px-4 py-4">
                          <div className="space-y-3">
                            {/* Error */}
                            {log.errorMessage && (
                              <div className="bg-red-50 border border-red-200 rounded p-3">
                                <p className="text-xs font-medium text-red-700 mb-1">Error</p>
                                <p className="text-xs font-mono text-red-600">{log.errorMessage}</p>
                              </div>
                            )}

                            {/* Meta */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                              {log.eventId && (
                                <div>
                                  <p className="text-muted-foreground mb-0.5">Event ID</p>
                                  <p className="font-mono truncate">{log.eventId}</p>
                                </div>
                              )}
                              {log.relatedType && (
                                <div>
                                  <p className="text-muted-foreground mb-0.5">Related</p>
                                  <p className="font-mono truncate">{log.relatedType}: {log.relatedId}</p>
                                </div>
                              )}
                              {log.lastReplayedAt && (
                                <div>
                                  <p className="text-muted-foreground mb-0.5">Last replayed</p>
                                  <p>{new Date(log.lastReplayedAt).toLocaleString()}</p>
                                </div>
                              )}
                            </div>

                            {/* Payload */}
                            <div>
                              <p className="text-xs text-muted-foreground mb-1.5">Payload</p>
                              <pre className="text-xs bg-background border rounded p-3 overflow-x-auto max-h-64 font-mono leading-relaxed">
                                {JSON.stringify(log.payload, null, 2)}
                              </pre>
                            </div>

                            {/* Replay button */}
                            {log.status !== 'ignored' && (
                              <div className="flex items-center gap-3">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="gap-2"
                                  disabled={replayingId === log.id}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleReplay(log);
                                  }}
                                >
                                  <RotateCcw className={cn('h-3.5 w-3.5', replayingId === log.id && 'animate-spin')} />
                                  {replayingId === log.id ? 'Replaying…' : 'Replay event'}
                                </Button>
                                <p className="text-xs text-muted-foreground">
                                  Re-runs the handler logic with the stored payload. A new log entry will be created.
                                </p>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
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
              disabled={offset === 0}
              onClick={() => {
                const next = Math.max(0, offset - PAGE_SIZE);
                setOffset(next);
                fetchLogs(next);
              }}
              className="gap-1"
            >
              <ChevronLeft className="h-3.5 w-3.5" /> Prev
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={offset + PAGE_SIZE >= total}
              onClick={() => {
                const next = offset + PAGE_SIZE;
                setOffset(next);
                fetchLogs(next);
              }}
              className="gap-1"
            >
              Next <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
