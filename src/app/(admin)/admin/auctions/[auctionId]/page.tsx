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
import { ArrowLeft, Trash2, Plus, X, Download, ExternalLink, Radio, Ban, Play, Square, Search, Receipt } from 'lucide-react';
import { toast } from 'sonner';
import { formatCurrency } from '@/types';

const statusColors: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-800',
  scheduled: 'bg-blue-100 text-blue-800',
  preview: 'bg-indigo-100 text-indigo-800',
  open: 'bg-green-100 text-green-800',
  live: 'bg-red-100 text-red-800',
  closing: 'bg-orange-100 text-orange-800',
  closed: 'bg-gray-100 text-gray-600',
  completed: 'bg-emerald-100 text-emerald-800',
  cancelled: 'bg-red-100 text-red-600',
};

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
  if (!d) return '—';
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(d));
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

type PendingAction =
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
  const [loadError, setLoadError] = useState(false);
  const [assignedLots, setAssignedLots] = useState<AssignedLot[]>([]);
  const [availableLots, setAvailableLots] = useState<AvailableLot[]>([]);
  const [lotSearch, setLotSearch] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [pending, setPending] = useState<PendingAction>(null);
  const [renumbering, setRenumbering] = useState<string | null>(null);

  const loadAuction = useCallback(async () => {
    try {
      const res = await fetch(`/api/auctions/${auctionId}`);
      const d = await res.json();
      if (d.data) setAuction(d.data);
      else setLoadError(true);
    } catch {
      setLoadError(true);
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

  if (loadError) {
    return (
      <div className="max-w-4xl">
        <Link href="/admin/auctions" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6">
          <ArrowLeft className="h-4 w-4" />
          Back to Auctions
        </Link>
        <h1 className="font-display text-display-sm mb-4">Auction Not Found</h1>
        <p className="text-muted-foreground">This auction does not exist or could not be loaded.</p>
      </div>
    );
  }

  if (!auction) {
    return <div className="text-muted-foreground">Loading...</div>;
  }

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

  async function patchStatus(newStatus: string) {
    const res = await fetch(`/api/auctions/${auctionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data.error || 'Failed to update status');
      throw new Error(data.error || 'Failed to update status');
    }
    setAuction(data.data ?? null);
    loadAssignedLots();
  }

  async function handleSubmit(data: Record<string, unknown>) {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/auctions/${auctionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error);
      setAuction(result.data);
      toast.success('Auction saved');
      if (biddingOpen) loadAssignedLots();
    } finally {
      setIsLoading(false);
    }
  }

  async function handleDelete() {
    const res = await fetch(`/api/auctions/${auctionId}`, { method: 'DELETE' });
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
  }

  async function removeLot(lot: AssignedLot) {
    const res = await fetch(`/api/auctions/${auctionId}/lots`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lotId: lot.id }),
    });
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

  const dialog = (() => {
    if (!pending) return null;
    switch (pending.kind) {
      case 'open':
        return {
          title: 'Open bidding now?',
          description: `Every assigned lot (${assignedLots.length}) becomes biddable immediately and the sale appears as open on the site. This ignores the scheduled opening time.`,
          confirmLabel: 'Open bidding',
          variant: 'default' as const,
          onConfirm: () => patchStatus('open'),
        };
      case 'end':
        return {
          title: 'End bidding now?',
          description: 'Bidding stops on every lot immediately, including lots whose staggered close time is still in the future. Settlement (winners, invoices) runs automatically within a few minutes and cannot be undone.',
          confirmLabel: 'End bidding',
          variant: 'destructive' as const,
          onConfirm: () => patchStatus('closing'),
        };
      case 'cancel':
        return {
          title: 'Cancel this auction?',
          description: biddingOpen
            ? 'Only possible while no bids have been placed. Assigned lots go back to approved inventory and the sale is marked cancelled.'
            : 'Assigned lots stay in inventory (status approved) and the sale is marked cancelled. It will no longer be listed publicly.',
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
      <Link href="/admin/auctions" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6">
        <ArrowLeft className="h-4 w-4" />
        Back to Auctions
      </Link>

      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display text-display-sm truncate">{auction.title as string}</h1>
            <Badge className={statusColors[status]}>{status}</Badge>
            {(auction.saleNumber as string) && (
              <span className="text-sm text-muted-foreground">Sale {auction.saleNumber as string}</span>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-1">{statusHelp[status]}</p>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
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
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <Card><CardContent className="pt-5">
          <p className="text-xs text-muted-foreground">Lots</p>
          <p className="text-xl font-semibold">{assignedLots.length}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-5">
          <p className="text-xs text-muted-foreground">Total estimate</p>
          <p className="text-xl font-semibold">{summary.low ? `${formatCurrency(summary.low)} – ${formatCurrency(summary.high)}` : '—'}</p>
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

      {!finished && (
        <Card className="mb-6">
          <CardHeader className="pb-3"><CardTitle className="text-sm">Sale controls</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap items-center gap-2">
            {status === 'draft' && (
              <Button size="sm" onClick={() => patchStatus('scheduled').then(() => toast.success('Auction scheduled')).catch(() => {})} disabled={assignedLots.length === 0}>
                Publish as scheduled
              </Button>
            )}
            {status === 'scheduled' && (
              <Button size="sm" variant="outline" onClick={() => patchStatus('preview').then(() => toast.success('Preview opened')).catch(() => {})}>
                Open preview
              </Button>
            )}
            {(status === 'scheduled' || status === 'preview') && type === 'timed' && (
              <Button size="sm" className="gap-1.5" onClick={() => setPending({ kind: 'open' })} disabled={assignedLots.length === 0}>
                <Play className="h-3.5 w-3.5" /> Open bidding now
              </Button>
            )}
            {(status === 'scheduled' || status === 'preview') && (
              <Button size="sm" variant="ghost" onClick={() => patchStatus('draft').then(() => toast.success('Moved back to draft')).catch(() => {})}>
                Unpublish (back to draft)
              </Button>
            )}
            {status === 'open' && (
              <Button size="sm" variant="destructive" className="gap-1.5" onClick={() => setPending({ kind: 'end' })}>
                <Square className="h-3.5 w-3.5" /> End bidding now
              </Button>
            )}
            {status === 'live' && (
              <span className="text-sm text-muted-foreground">Live session in progress — end it from the live console.</span>
            )}
            {(preOpen || (biddingOpen && summary.bids === 0)) && (
              <Button size="sm" variant="ghost" className="gap-1.5 text-red-600 hover:text-red-700 ml-auto" onClick={() => setPending({ kind: 'cancel' })}>
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

        <TabsContent value="details" className="mt-6">
          <AuctionForm
            key={`${status}-${auction.updatedAt as string}`}
            initialData={formData}
            locked={biddingOpen || finished}
            onSubmit={handleSubmit}
            isLoading={isLoading}
            submitLabel="Save changes"
            cancelHref="/admin/auctions"
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
                          <span>{lot.estimateLow ? `${formatCurrency(lot.estimateLow)} – ${formatCurrency(lot.estimateHigh ?? lot.estimateLow)}` : 'No estimate'}</span>
                          {lot.bidCount > 0 && <span>{lot.bidCount} bids · {formatCurrency(lot.currentBidAmount)}</span>}
                          {biddingOpen && lot.closingAt && <span>closes {formatWhen(lot.closingAt)}</span>}
                          <span className="capitalize">{lot.status.replace('_', ' ')}</span>
                        </div>
                      </div>
                      {!finished && (
                        <Button variant="ghost" size="sm" onClick={() => setPending({ kind: 'remove-lot', lot })} className="text-red-600 hover:text-red-700" title="Remove from sale">
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
                        <Button variant="outline" size="sm" onClick={() => assignLot(lot.id)}>
                          <Plus className="h-4 w-4 mr-1" /> Add
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
    <Suspense>
      <EditAuctionContent />
    </Suspense>
  );
}
