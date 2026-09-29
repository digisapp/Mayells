'use client';

import { useState, useEffect, useCallback, useMemo, Suspense } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { AuctionForm, type AuctionFormData, defaultAuctionFormData } from '@/components/admin/AuctionForm';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Trash2, Plus, X, Download, ExternalLink, Radio, Ban, Play, Square, Search, Receipt, AlertCircle, Loader2 } from 'lucide-react';
import { PageHeader } from '@/components/admin/PageHeader';
import { toast } from 'sonner';
import { formatCurrency } from '@/types';
import { auctionStatus, lotStatus } from '@/lib/admin/status/sales';
import { formatShortDateTime } from '@/lib/format/dates';
import { formatEstimate } from '@/lib/format/estimate';
import AuctionDetailLoading from './loading';

const statusHelp: Record<string, string> = {
  draft: 'Not visible to the public. Assign lots and set a schedule, then mark it scheduled.',
  scheduled: 'Listed on the site as upcoming. Bidding opens automatically at the scheduled time.',
  preview: 'Catalog is browsable; bidding is not yet open.',
  open: 'Bidding is live. Lots close on their staggered schedule and settle automatically.',
  live: 'An auctioneer session is running. Manage it from the Live Auctions console.',
  closing: 'Bidding has ended. Settlement runs within the next few minutes.',
  closed: 'Settling lots — invoices are being generated.',
  completed: 'Every lot is settled. Invoices, payouts and shipments live in their own pages.',
  cancelled: 'Cancelled. Its lots were released back to inventory.',
};

// Format for <input type="datetime-local">, which expects local wall time
// ("YYYY-MM-DDTHH:mm") — not the UTC time that toISOString() would produce.
function formatDate(d: string | null) {
  if (!d) return '';
  const date = new Date(d);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatWhen(d: string | null) {
  return d ? formatShortDateTime(d) : '—';
}

interface AssignedLot {
  id: string;
  title: string;
  lotNumber: number;
  status: string;
  estimateLow: number | null;
  estimateHigh: number | null;
  currentBidAmount: number;
  bidCount: number;
  primaryImageUrl: string | null;
  closingAt: string | null;
}

interface AvailableLot {
  id: string;
  title: string;
  artist: string | null;
  status: string;
  estimateLow: number | null;
  primaryImageUrl: string | null;
}

/** Status moves that don't need their own explanation dialog. */
type StatusMove = { to: 'scheduled' | 'preview' | 'draft'; success: string };

type PendingAction =
  | { kind: 'publish' }
  | { kind: 'status'; move: StatusMove }
  | { kind: 'open' }
  | { kind: 'end' }
  | { kind: 'cancel' }
  | { kind: 'delete' }
  | { kind: 'remove-lot'; lot: AssignedLot }
  | null;

function EditAuctionContent() {
  const router = useRouter();
  const { auctionId } = useParams<{ auctionId: string }>();
  const searchParams = useSearchParams();
  const initialTab = searchParams.get('tab') === 'lots' ? 'lots' : 'details';
  const [auction, setAuction] = useState<Record<string, unknown> | null>(null);
  // 'missing' is a real 404; 'failed' is a network/server error worth retrying.
  const [loadError, setLoadError] = useState<'missing' | 'failed' | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [assignedLots, setAssignedLots] = useState<AssignedLot[]>([]);
  const [availableLots, setAvailableLots] = useState<AvailableLot[]>([]);
  const [lotSearch, setLotSearch] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [pending, setPending] = useState<PendingAction>(null);
  const [renumbering, setRenumbering] = useState<string | null>(null);
  // One sale-control request at a time: a double click must not fire a second
  // PATCH (which the API answers with a 409 toast).
  const [busyStatus, setBusyStatus] = useState<string | null>(null);
  const [addingLotId, setAddingLotId] = useState<string | null>(null);
  // Unsaved edits on the Details tab. A status change remounts the form (the
  // server may have changed the schedule), so those moves warn first.
  const [detailsDirty, setDetailsDirty] = useState(false);

  const loadAuction = useCallback(async () => {
    try {
      const res = await fetch(`/api/auctions/${auctionId}`);
      if (res.status === 404) {
        setLoadError('missing');
        return;
      }
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.data) {
        setAuction(d.data);
        setLoadError(null);
      } else {
        setLoadError('failed');
      }
    } catch {
      setLoadError('failed');
    }
  }, [auctionId]);

  const loadAssignedLots = useCallback(() => {
    fetch(`/api/auctions/${auctionId}/lots`)
      .then((r) => r.json())
      .then((d) => setAssignedLots(d.data || []))
      .catch(() => toast.error('Failed to load assigned lots'));
  }, [auctionId]);

  const loadAvailableLots = useCallback((q: string) => {
    const params = new URLSearchParams({ status: 'approved', saleType: 'auction', limit: '100' });
    if (q.trim()) params.set('q', q.trim());
    fetch(`/api/lots?${params}`)
      .then((r) => r.json())
      .then((d) => setAvailableLots(d.data || []))
      .catch(() => toast.error('Failed to load available lots'));
  }, []);

  useEffect(() => {
    loadAuction();
    loadAssignedLots();
  }, [loadAuction, loadAssignedLots]);

  useEffect(() => {
    const t = setTimeout(() => loadAvailableLots(lotSearch), 250);
    return () => clearTimeout(t);
  }, [lotSearch, loadAvailableLots]);

  const status = (auction?.status as string) || 'draft';
  const type = (auction?.type as 'timed' | 'live') || 'timed';
  const slug = (auction?.slug as string) || '';
  const biddingOpen = status === 'open' || status === 'live';
  const preOpen = ['draft', 'scheduled', 'preview'].includes(status);
  const finished = ['closing', 'closed', 'completed', 'cancelled'].includes(status);

  const summary = useMemo(() => {
    const low = assignedLots.reduce((s, l) => s + (l.estimateLow ?? 0), 0);
    const high = assignedLots.reduce((s, l) => s + (l.estimateHigh ?? 0), 0);
    const bids = assignedLots.reduce((s, l) => s + (l.bidCount ?? 0), 0);
    const current = assignedLots.reduce((s, l) => s + (l.currentBidAmount ?? 0), 0);
    const sold = assignedLots.filter((l) => l.status === 'sold').length;
    const withBids = assignedLots.filter((l) => (l.bidCount ?? 0) > 0).length;
    return { low, high, bids, current, sold, withBids };
  }, [assignedLots]);

  if (loadError === 'missing') {
    return (
      <div className="max-w-4xl">
        <PageHeader title="Auction not found" description="This auction does not exist or was deleted." />
        <Link href="/admin/auctions" className="text-sm underline underline-offset-2 text-muted-foreground hover:text-foreground">
          All auctions
        </Link>
      </div>
    );
  }

  if (loadError === 'failed' && !auction) {
    return (
      <div className="max-w-4xl">
        <PageHeader title="Auction" />
        <Card>
          <CardContent className="py-12 text-center">
            <AlertCircle className="h-10 w-10 text-destructive mx-auto mb-3" />
            <p className="text-muted-foreground mb-4">Couldn&apos;t load this auction. Check your connection and try again.</p>
            <Button
              variant="outline"
              disabled={retrying}
              onClick={async () => {
                setRetrying(true);
                await Promise.all([loadAuction(), loadAssignedLots()]);
                setRetrying(false);
              }}
            >
              {retrying ? 'Retrying…' : 'Retry'}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!auction) return <AuctionDetailLoading />;

  const formData: AuctionFormData = {
    ...defaultAuctionFormData,
    title: (auction.title as string) || '',
    subtitle: (auction.subtitle as string) || '',
    saleNumber: (auction.saleNumber as string) || '',
    description: (auction.description as string) || '',
    slug,
    liveauctioneersUrl: (auction.liveauctioneersUrl as string) || '',
    type,
    previewStartsAt: formatDate(auction.previewStartsAt as string | null),
    biddingStartsAt: formatDate(auction.biddingStartsAt as string | null),
    biddingEndsAt: formatDate(auction.biddingEndsAt as string | null),
    buyerPremiumPercent: (auction.buyerPremiumPercent as number) ?? 25,
    antiSnipeEnabled: (auction.antiSnipeEnabled as boolean) ?? true,
    antiSnipeMinutes: (auction.antiSnipeMinutes as number) ?? 2,
    antiSnipeWindowMinutes: (auction.antiSnipeWindowMinutes as number) ?? 5,
    lotClosingIntervalSeconds: (auction.lotClosingIntervalSeconds as number) ?? 30,
    isFeatured: (auction.isFeatured as boolean) ?? false,
  };

  /**
   * fetch that toasts a network failure before rethrowing, so confirm-dialog
   * handlers (ConfirmDialog stays open on a rejection but shows nothing) always
   * surface why.
   */
  async function fetchOrToast(input: string, init: RequestInit, failure: string) {
    try {
      return await fetch(input, init);
    } catch (err) {
      toast.error(`Network error — ${failure}`);
      throw err;
    }
  }

  async function patchStatus(newStatus: string) {
    const res = await fetchOrToast(`/api/auctions/${auctionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    }, 'the status was not changed');
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data.error || 'Failed to update status');
      throw new Error(data.error || 'Failed to update status');
    }
    setAuction(data.data ?? null);
    loadAssignedLots();
  }

  /**
   * `rethrow` is for the confirm dialog: a rejection keeps it open (the
   * reason is already toasted). Quick-action buttons swallow the error.
   */
  async function runStatusMove(move: StatusMove, { rethrow = false } = {}) {
    setBusyStatus(move.to);
    try {
      await patchStatus(move.to);
      toast.success(move.success);
    } catch (err) {
      // patchStatus already toasted the reason.
      if (rethrow) throw err;
    } finally {
      setBusyStatus(null);
    }
  }

  /** Quick moves run straight away unless they would discard Details edits. */
  function requestStatusMove(move: StatusMove) {
    if (detailsDirty) setPending({ kind: 'status', move });
    else runStatusMove(move);
  }

  async function handleSubmit(data: Record<string, unknown>) {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/auctions/${auctionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(result.error || `Could not save (${res.status})`);
      setAuction(result.data);
      toast.success('Auction saved');
      if (biddingOpen) loadAssignedLots();
    } finally {
      setIsLoading(false);
    }
  }

  async function handleDelete() {
    const res = await fetchOrToast(`/api/auctions/${auctionId}`, { method: 'DELETE' }, 'the auction was not deleted');
    if (res.ok) {
      toast.success('Auction deleted');
      router.push('/admin/auctions');
    } else {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error || 'Failed to delete');
      throw new Error('delete failed');
    }
  }

  async function assignLot(lotId: string) {
    if (addingLotId) return;
    setAddingLotId(lotId);
    try {
      const res = await fetch(`/api/auctions/${auctionId}/lots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lotId }),
      });
      if (res.ok) {
        toast.success('Lot added to sale');
        loadAssignedLots();
        loadAvailableLots(lotSearch);
        loadAuction();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || 'Failed to assign lot');
        if (res.status === 409) loadAssignedLots();
      }
    } catch {
      toast.error('Network error — the lot was not added');
    } finally {
      setAddingLotId(null);
    }
  }

  async function removeLot(lot: AssignedLot) {
    const res = await fetchOrToast(`/api/auctions/${auctionId}/lots`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lotId: lot.id }),
    }, 'the lot was not removed');
    if (res.ok) {
      toast.success(`Lot ${lot.lotNumber} removed`);
      loadAssignedLots();
      loadAvailableLots(lotSearch);
      loadAuction();
    } else {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error || 'Failed to remove lot');
      throw new Error('remove failed');
    }
  }

  async function renumberLot(lot: AssignedLot, raw: string) {
    const lotNumber = parseInt(raw, 10);
    setRenumbering(null);
    if (!Number.isFinite(lotNumber) || lotNumber < 1 || lotNumber === lot.lotNumber) return;
    const res = await fetch(`/api/auctions/${auctionId}/lots`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lotId: lot.id, lotNumber }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      toast.success(`Renumbered to lot ${lotNumber}`);
    } else {
      toast.error(data.error || 'Could not renumber');
    }
    loadAssignedLots();
  }

  async function exportForLiveAuctioneers() {
    try {
      const res = await fetch(`/api/auctions/${auctionId}/export-csv`);
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || 'Export failed');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = res.headers.get('Content-Disposition')?.match(/filename="(.+)"/)?.[1] || 'export.csv';
      a.click();
      URL.revokeObjectURL(url);
      toast.success('CSV exported for LiveAuctioneers');
    } catch {
      toast.error('Export failed');
    }
  }

  // Filter out lots already assigned
  const assignedIds = new Set(assignedLots.map((l) => l.id));
  const unassignedLots = availableLots.filter((l) => !assignedIds.has(l.id));

  const discardNote = detailsDirty ? ' Unsaved edits on the Details tab will be discarded — save them first to keep them.' : '';
  const opensAt = auction.biddingStartsAt as string | null;

  const dialog = (() => {
    if (!pending) return null;
    switch (pending.kind) {
      case 'publish':
        return {
          title: 'Publish this sale?',
          description: `The sale and its ${assignedLots.length} ${assignedLots.length === 1 ? 'lot' : 'lots'} become public on the site as upcoming. ${
            opensAt ? `Bidding opens automatically ${formatWhen(opensAt)}.` : 'No bidding start time is set yet.'
          }${discardNote}`,
          confirmLabel: 'Publish',
          variant: 'default' as const,
          onConfirm: () => patchStatus('scheduled').then(() => { toast.success('Auction scheduled'); }),
        };
      case 'status':
        return {
          title: 'Discard unsaved edits?',
          description: `You have unsaved changes on the Details tab. Changing the sale status reloads the form and they will be lost.`,
          confirmLabel: 'Discard and continue',
          variant: 'destructive' as const,
          onConfirm: () => runStatusMove(pending.move, { rethrow: true }),
        };
      case 'open':
        return {
          title: 'Open bidding now?',
          description: `Every assigned lot (${assignedLots.length}) becomes biddable immediately and the sale appears as open on the site. This ignores the scheduled opening time.${discardNote}`,
          confirmLabel: 'Open bidding',
          variant: 'default' as const,
          onConfirm: () => patchStatus('open'),
        };
      case 'end':
        return {
          title: 'End bidding now?',
          description: 'Bidding stops on every lot immediately, including lots whose staggered close time is still in the future. Settlement (winners, invoices) runs automatically within a few minutes and cannot be undone.' + discardNote,
          confirmLabel: 'End bidding',
          variant: 'destructive' as const,
          onConfirm: () => patchStatus('closing'),
        };
      case 'cancel':
        return {
          title: 'Cancel this auction?',
          description: biddingOpen
            ? 'Only possible while no bids have been placed. Assigned lots go back to approved inventory and the sale is marked cancelled.' + discardNote
            : 'Assigned lots stay in inventory (status approved) and the sale is marked cancelled. It will no longer be listed publicly.' + discardNote,
          confirmLabel: 'Cancel auction',
          variant: 'destructive' as const,
          onConfirm: () => patchStatus('cancelled'),
        };
      case 'delete':
        return {
          title: 'Delete this auction?',
          description: 'Permanently removes the sale record and its lot assignments. Lots themselves are kept. This cannot be undone — prefer Cancel if you want to keep a record.',
          confirmLabel: 'Delete permanently',
          variant: 'destructive' as const,
          onConfirm: handleDelete,
        };
      case 'remove-lot':
        return {
          title: `Remove lot ${pending.lot.lotNumber} from this sale?`,
          description: biddingOpen
            ? 'The lot goes back to approved inventory. If it has already received bids this will be refused — withdraw the lot from its editor instead.'
            : 'The lot goes back to approved inventory and can be added to another sale.',
          confirmLabel: 'Remove lot',
          variant: 'destructive' as const,
          onConfirm: () => removeLot(pending.lot),
        };
    }
  })();

  return (
    <div className="max-w-5xl">
      <PageHeader
        title={auction.title as string}
        badges={
          <>
            <Badge className={auctionStatus(status).className}>{auctionStatus(status).label}</Badge>
            {(auction.saleNumber as string) && (
              <span className="text-sm text-muted-foreground">Sale {auction.saleNumber as string}</span>
            )}
          </>
        }
        description={statusHelp[status]}
        actions={
          <>
            {slug && !['draft', 'cancelled'].includes(status) && (
              <Button asChild variant="outline" size="sm" className="gap-1.5">
                <a href={`/auctions/${slug}`} target="_blank" rel="noreferrer"><ExternalLink className="h-3.5 w-3.5" /> View on site</a>
              </Button>
            )}
            {type === 'live' && !finished && (
              <Button asChild variant="outline" size="sm" className="gap-1.5">
                <Link href={`/admin/live/${auctionId}`}><Radio className="h-3.5 w-3.5" /> Live console</Link>
              </Button>
            )}
            {['closing', 'closed', 'completed'].includes(status) && (
              <Button asChild size="sm" className="gap-1.5">
                <Link href={`/admin/auctions/${auctionId}/settlement`}><Receipt className="h-3.5 w-3.5" /> Settlement</Link>
              </Button>
            )}
          </>
        }
      >
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Card><CardContent className="pt-5">
            <p className="text-xs text-muted-foreground">Lots</p>
            <p className="text-xl font-semibold">{assignedLots.length}</p>
          </CardContent></Card>
          <Card><CardContent className="pt-5">
            <p className="text-xs text-muted-foreground">Total estimate</p>
            <p className="text-xl font-semibold">{formatEstimate(summary.low, summary.high) ?? '—'}</p>
          </CardContent></Card>
          <Card><CardContent className="pt-5">
            <p className="text-xs text-muted-foreground">Bids · lots with bids</p>
            <p className="text-xl font-semibold">{summary.bids} · {summary.withBids}/{assignedLots.length || 0}</p>
          </CardContent></Card>
          <Card><CardContent className="pt-5">
            <p className="text-xs text-muted-foreground">{status === 'completed' ? 'Sold' : 'Current bids total'}</p>
            <p className="text-xl font-semibold">{status === 'completed' ? `${summary.sold}/${assignedLots.length}` : summary.current ? formatCurrency(summary.current) : '—'}</p>
          </CardContent></Card>
        </div>
      </PageHeader>

      {!finished && (
        <Card className="mb-6">
          <CardHeader className="pb-3"><CardTitle className="text-sm">Sale controls</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap items-center gap-2">
            {status === 'draft' && (
              <Button size="sm" onClick={() => setPending({ kind: 'publish' })} disabled={assignedLots.length === 0 || !!busyStatus}>
                Publish as scheduled
              </Button>
            )}
            {status === 'scheduled' && (
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={() => requestStatusMove({ to: 'preview', success: 'Preview opened' })}
                disabled={!!busyStatus}
              >
                {busyStatus === 'preview' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Open preview
              </Button>
            )}
            {(status === 'scheduled' || status === 'preview') && type === 'timed' && (
              <Button size="sm" className="gap-1.5" onClick={() => setPending({ kind: 'open' })} disabled={assignedLots.length === 0 || !!busyStatus}>
                <Play className="h-3.5 w-3.5" /> Open bidding now
              </Button>
            )}
            {(status === 'scheduled' || status === 'preview') && (
              <Button
                size="sm"
                variant="ghost"
                className="gap-1.5"
                onClick={() => requestStatusMove({ to: 'draft', success: 'Moved back to draft' })}
                disabled={!!busyStatus}
              >
                {busyStatus === 'draft' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Unpublish (back to draft)
              </Button>
            )}
            {status === 'open' && (
              <Button size="sm" variant="destructive" className="gap-1.5" onClick={() => setPending({ kind: 'end' })} disabled={!!busyStatus}>
                <Square className="h-3.5 w-3.5" /> End bidding now
              </Button>
            )}
            {status === 'live' && (
              <span className="text-sm text-muted-foreground">Live session in progress — end it from the live console.</span>
            )}
            {(preOpen || (biddingOpen && summary.bids === 0)) && (
              <Button size="sm" variant="ghost" className="gap-1.5 text-red-600 hover:text-red-700 ml-auto" onClick={() => setPending({ kind: 'cancel' })} disabled={!!busyStatus}>
                <Ban className="h-3.5 w-3.5" /> Cancel auction
              </Button>
            )}
            {status === 'draft' && assignedLots.length === 0 && (
              <p className="basis-full text-xs text-muted-foreground">Add at least one lot before publishing.</p>
            )}
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue={initialTab} className="mb-8">
        <TabsList>
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="lots">Lots ({assignedLots.length})</TabsTrigger>
        </TabsList>

        {/* forceMount keeps the form (and any unsaved edits) alive while the
            Lots tab is showing. Keyed on status only: adding a lot or saving
            bumps updatedAt, which must not reset what's being typed; a status
            change does, since the server may move the schedule. */}
        <TabsContent value="details" forceMount className="mt-6 data-[state=inactive]:hidden">
          <AuctionForm
            key={status}
            initialData={formData}
            locked={biddingOpen || finished}
            onSubmit={handleSubmit}
            isLoading={isLoading}
            submitLabel="Save changes"
            cancelHref="/admin/auctions"
            onDirtyChange={setDetailsDirty}
          />
        </TabsContent>

        <TabsContent value="lots" className="mt-6 space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <CardTitle>Assigned lots ({assignedLots.length})</CardTitle>
                {assignedLots.length > 0 && (
                  <Button variant="outline" size="sm" onClick={exportForLiveAuctioneers} className="gap-2">
                    <Download className="h-4 w-4" />
                    Export for LiveAuctioneers
                  </Button>
                )}
              </div>
              {!finished && assignedLots.length > 0 && (
                <p className="text-xs text-muted-foreground">Click a lot number to renumber it. Lots close in lot-number order.</p>
              )}
            </CardHeader>
            <CardContent>
              {assignedLots.length === 0 ? (
                <p className="text-sm text-muted-foreground">No lots assigned yet. Add lots from the available list below.</p>
              ) : (
                <div className="space-y-2">
                  {assignedLots.map((lot) => (
                    <div key={lot.id} className="flex items-center gap-3 p-3 rounded-md border">
                      {renumbering === lot.id ? (
                        <Input
                          autoFocus
                          type="number"
                          min={1}
                          defaultValue={lot.lotNumber}
                          className="w-16 h-8 text-sm"
                          aria-label={`New lot number for ${lot.title}`}
                          onBlur={(e) => renumberLot(lot, e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                            if (e.key === 'Escape') setRenumbering(null);
                          }}
                        />
                      ) : (
                        <button
                          type="button"
                          className="w-16 h-8 text-sm font-mono text-left px-2 rounded hover:bg-muted disabled:hover:bg-transparent"
                          onClick={() => setRenumbering(lot.id)}
                          disabled={finished}
                          title="Renumber"
                        >
                          #{lot.lotNumber}
                        </button>
                      )}
                      {lot.primaryImageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element -- admin thumbnail
                        <img src={lot.primaryImageUrl} alt={lot.title} className="w-12 h-12 object-cover rounded" />
                      ) : (
                        <div className="w-12 h-12 bg-muted rounded flex items-center justify-center text-xs text-muted-foreground">No img</div>
                      )}
                      <div className="flex-1 min-w-0">
                        <Link href={`/admin/lots/${lot.id}`} className="font-medium text-sm truncate block hover:underline">{lot.title}</Link>
                        <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3">
                          <span>{formatEstimate(lot.estimateLow, lot.estimateHigh) ?? 'No estimate'}</span>
                          {lot.bidCount > 0 && <span>{lot.bidCount} bids · {formatCurrency(lot.currentBidAmount)}</span>}
                          {biddingOpen && lot.closingAt && <span>closes {formatWhen(lot.closingAt)}</span>}
                          <span>{lotStatus(lot.status).label}</span>
                        </div>
                      </div>
                      {!finished && (
                        <Button variant="ghost" size="sm" onClick={() => setPending({ kind: 'remove-lot', lot })} className="text-red-600 hover:text-red-700" title="Remove from sale" aria-label={`Remove lot ${lot.lotNumber} from sale`}>
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {!finished && (
            <Card>
              <CardHeader>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <CardTitle>Available lots</CardTitle>
                  <div className="relative sm:w-72">
                    <Search className="h-4 w-4 absolute left-2.5 top-2.5 text-muted-foreground" />
                    <Input value={lotSearch} onChange={(e) => setLotSearch(e.target.value)} placeholder="Search approved lots…" className="pl-8" />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">Only approved auction-type lots can be added. Approve lots from their editor first.</p>
              </CardHeader>
              <CardContent>
                {unassignedLots.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {lotSearch ? 'No approved lots match that search.' : 'No approved lots available.'}{' '}
                    <Link href="/admin/lots?status=draft" className="underline">Review draft lots</Link>
                  </p>
                ) : (
                  <div className="space-y-2">
                    {unassignedLots.map((lot) => (
                      <div key={lot.id} className="flex items-center gap-3 p-3 rounded-md border">
                        {lot.primaryImageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element -- admin thumbnail
                          <img src={lot.primaryImageUrl} alt={lot.title} className="w-12 h-12 object-cover rounded" />
                        ) : (
                          <div className="w-12 h-12 bg-muted rounded flex items-center justify-center text-xs text-muted-foreground">No img</div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm truncate">{lot.title}</div>
                          <div className="text-xs text-muted-foreground">
                            {lot.artist || ''} {lot.estimateLow ? `· Est. ${formatCurrency(lot.estimateLow)}` : ''}
                          </div>
                        </div>
                        <Button variant="outline" size="sm" onClick={() => assignLot(lot.id)} disabled={!!addingLotId} aria-label={`Add ${lot.title} to sale`}>
                          {addingLotId === lot.id ? (
                            <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Adding…</>
                          ) : (
                            <><Plus className="h-4 w-4 mr-1" /> Add</>
                          )}
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {!['open', 'live', 'closing', 'closed'].includes(status) && (
        <div className="pt-8 border-t">
          <Button variant="destructive" size="sm" onClick={() => setPending({ kind: 'delete' })}>
            <Trash2 className="h-4 w-4 mr-2" />
            Delete auction
          </Button>
          <p className="text-xs text-muted-foreground mt-2">Only possible for sales that never took a bid. Prefer Cancel to keep a record.</p>
        </div>
      )}

      {dialog && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setPending(null)}
          title={dialog.title}
          description={dialog.description}
          confirmLabel={dialog.confirmLabel}
          variant={dialog.variant}
          onConfirm={dialog.onConfirm}
        />
      )}
    </div>
  );
}

export default function EditAuctionPage() {
  // useSearchParams requires a Suspense boundary
  return (
    <Suspense fallback={<AuctionDetailLoading />}>
      <EditAuctionContent />
    </Suspense>
  );
}
