'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { LiveChat } from '@/components/live/LiveChat';
import { useRealtimeTopic } from '@/hooks/useRealtimeTopic';
import { formatCurrency } from '@/types';
import { toast } from 'sonner';
import { ArrowLeft, Play, Square, ChevronLeft, ChevronRight, Gavel, Clock } from 'lucide-react';

interface AuctionLot {
  lotNumber: number;
  closingAt: string | null;
  lot: {
    id: string;
    title: string;
    status: string;
    primaryImageUrl: string | null;
    currentBidAmount: number;
    bidCount: number;
    estimateLow: number | null;
    estimateHigh: number | null;
    reservePrice: number | null;
    currentBidderId: string | null;
    /** Joined by the lots API for admins; null when the bidder has no paddle yet. */
    currentBidderPaddle: string | null;
  };
}

interface AuctionData {
  id: string;
  title: string;
  status: string;
  type: 'timed' | 'live';
}

const FINISHED: readonly string[] = ['closing', 'closed', 'completed', 'cancelled'];

function formatRemaining(ms: number) {
  if (ms <= 0) return 'Closed';
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m ${sec}s`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

function formatWhen(iso: string) {
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
}

function highBidderLabel(lot: AuctionLot['lot']) {
  if (!lot.currentBidderId) return '—';
  if (lot.currentBidderPaddle) return `Paddle ${lot.currentBidderPaddle}`;
  // Bidder has no paddle number assigned yet — show a stable fragment of the id.
  return `Bidder ${lot.currentBidderId.slice(0, 8)}…`;
}

export default function AuctioneerDashboardPage() {
  const params = useParams();
  const router = useRouter();
  const auctionId = params.auctionId as string;

  const [auction, setAuction] = useState<AuctionData | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [lots, setLots] = useState<AuctionLot[]>([]);
  const [activeLotIndex, setActiveLotIndex] = useState(0);
  const [isLive, setIsLive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<'start' | 'end' | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const loadData = useCallback(async (silent = false) => {
    try {
      const [aRes, lRes] = await Promise.all([
        fetch(`/api/auctions/${auctionId}`),
        fetch(`/api/auctions/${auctionId}/lots`),
      ]);
      // Only a real 404 is terminal; a transient server error during a
      // background poll must not replace the console with "Not Found".
      if (aRes.status === 404) {
        setNotFound(true);
        return;
      }
      const aData = await aRes.json().catch(() => ({}));
      const lData = await lRes.json().catch(() => ({}));
      if (!aRes.ok || !aData.data) {
        if (!silent) toast.error(aData.error || 'Failed to load auction');
        return;
      }
      setAuction(aData.data);
      setIsLive(aData.data.status === 'live');
      if (!lRes.ok) {
        if (!silent) toast.error(lData.error || 'Failed to load lots');
        return;
      }
      // The lots API returns a FLAT shape ({ ...lot, lotNumber, closingAt });
      // this console renders the nested { lotNumber, lot } shape.
      const rawLots: Array<Record<string, unknown>> = lData.data ?? [];
      const mapped: AuctionLot[] = rawLots.map((row) => ({
        lotNumber: row.lotNumber as number,
        closingAt: (row.closingAt as string | null) ?? null,
        lot: {
          id: row.id as string,
          title: row.title as string,
          status: (row.status as string) ?? 'approved',
          primaryImageUrl: (row.primaryImageUrl as string | null) ?? null,
          currentBidAmount: (row.currentBidAmount as number) ?? 0,
          bidCount: (row.bidCount as number) ?? 0,
          estimateLow: (row.estimateLow as number | null) ?? null,
          estimateHigh: (row.estimateHigh as number | null) ?? null,
          reservePrice: (row.reservePrice as number | null) ?? null,
          currentBidderId: (row.currentBidderId as string | null) ?? null,
          currentBidderPaddle: (row.currentBidderPaddle as string | null) ?? null,
        },
      }));
      setLots(mapped);
      // A lot removed mid-session must not leave the selection pointing past
      // the end of the list.
      setActiveLotIndex((i) => Math.min(i, Math.max(0, mapped.length - 1)));
    } catch {
      // A failed background poll shouldn't spam toasts
      if (!silent) toast.error('Failed to load auction');
    } finally {
      setLoading(false);
    }
  }, [auctionId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // While live, keep lot/bid data fresh (fallback when Realtime is down)
  useEffect(() => {
    if (!isLive) return;
    const timer = setInterval(() => loadData(true), 5000);
    return () => clearInterval(timer);
  }, [isLive, loadData]);

  // Realtime: the bid engine broadcasts lot_bid / lot_closed on live:<id>;
  // each is a hint to refetch authoritative state.
  const onLiveEvent = useCallback((event: string) => {
    if (event === 'lot_bid' || event === 'lot_closed') loadData(true);
  }, [loadData]);
  useRealtimeTopic(isLive ? `live:${auctionId}` : null, onLiveEvent);

  // One-second tick for the per-lot countdowns
  useEffect(() => {
    if (!isLive) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [isLive]);

  async function handleGoLive() {
    try {
      const res = await fetch(`/api/live/${auctionId}/start`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || 'Failed to start the live session');
        return;
      }
      setIsLive(true);
      toast.success('Auction is now LIVE');
      loadData(true);
    } catch {
      toast.error('Network error');
    }
  }

  async function handleEndLive() {
    try {
      const res = await fetch(`/api/live/${auctionId}/end`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || 'Failed to end the live session');
        return;
      }
      setIsLive(false);
      toast.success('Live session ended — settlement runs within a few minutes');
      // Settlement status lives on the auction page, not the console list.
      router.push(`/admin/auctions/${auctionId}`);
    } catch {
      toast.error('Network error');
    }
  }

  const activeLot = lots[activeLotIndex];
  const isLiveFormat = auction?.type === 'live';
  const finished = !!auction && FINISHED.includes(auction.status);
  const openLots = lots.filter((l) => l.lot.status === 'in_auction').length;

  if (notFound) {
    return (
      <div>
        <Link href="/admin/live" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6">
          <ArrowLeft className="h-4 w-4" />
          Back to Live Auctions
        </Link>
        <h1 className="font-display text-display-sm mb-4">Auction Not Found</h1>
        <p className="text-muted-foreground">This auction does not exist or could not be loaded.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-champagne border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col lg:flex-row gap-6 h-[calc(100vh-120px)]">
      {/* Main panel */}
      <div className="flex-1 flex flex-col min-w-0">
        <Link href={`/admin/auctions/${auctionId}`} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-3">
          <ArrowLeft className="h-4 w-4" />
          Back to auction
        </Link>

        {/* Auction header */}
        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <div className="min-w-0">
            <h1 className="font-display text-xl truncate">{auction?.title}</h1>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              {isLive ? (
                <Badge className="bg-red-600 text-white animate-pulse">● LIVE</Badge>
              ) : finished ? (
                <Badge variant="secondary" className="capitalize">{auction?.status}</Badge>
              ) : (
                <Badge variant="secondary">Not live</Badge>
              )}
              <span className="text-sm text-muted-foreground">
                {lots.length} lots{isLive ? ` · ${openLots} open` : ''}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {finished ? (
              <Button asChild variant="outline" size="sm">
                <Link href={`/admin/auctions/${auctionId}`}>View settlement</Link>
              </Button>
            ) : !isLiveFormat ? (
              <p className="text-sm text-muted-foreground max-w-xs text-right">
                This is a timed sale — it opens on its schedule, or via <em>Open bidding now</em> on the auction page.
              </p>
            ) : !isLive ? (
              <Button onClick={() => setPending('start')} className="bg-red-600 hover:bg-red-700 text-white gap-2" disabled={lots.length === 0}>
                <Play className="h-4 w-4" /> Go Live
              </Button>
            ) : (
              <Button onClick={() => setPending('end')} variant="destructive" className="gap-2">
                <Square className="h-4 w-4" /> End Live
              </Button>
            )}
          </div>
        </div>
        {isLiveFormat && !isLive && !finished && lots.length === 0 && (
          <p className="text-xs text-muted-foreground -mt-2 mb-4">
            Add lots on the <Link href={`/admin/auctions/${auctionId}?tab=lots`} className="underline">auction page</Link> before going live.
          </p>
        )}

        {/* Current lot */}
        {activeLot && (() => {
          const { lot } = activeLot;
          const reserveMet = lot.reservePrice != null ? lot.currentBidAmount >= lot.reservePrice : null;
          const closeMs = activeLot.closingAt ? new Date(activeLot.closingAt).getTime() - now : null;
          return (
            <Card className="mb-4">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm text-muted-foreground">
                    Current Lot: #{activeLot.lotNumber}
                  </CardTitle>
                  <div className="flex gap-1">
                    <Button
                      size="icon"
                      variant="outline"
                      onClick={() => setActiveLotIndex(Math.max(0, activeLotIndex - 1))}
                      disabled={activeLotIndex === 0}
                      className="h-8 w-8"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="outline"
                      onClick={() => setActiveLotIndex(Math.min(lots.length - 1, activeLotIndex + 1))}
                      disabled={activeLotIndex >= lots.length - 1}
                      className="h-8 w-8"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex gap-4">
                  {lot.primaryImageUrl && (
                    <div className="w-32 h-32 rounded overflow-hidden flex-shrink-0 bg-muted">
                      {/* eslint-disable-next-line @next/next/no-img-element -- admin thumbnail, external URL */}
                      <img src={lot.primaryImageUrl} alt={lot.title} className="w-full h-full object-cover" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <h2 className="font-display text-lg">{lot.title}</h2>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground mt-1">
                      {lot.estimateLow != null && (
                        <span>Estimate: {formatCurrency(lot.estimateLow)} – {formatCurrency(lot.estimateHigh ?? lot.estimateLow)}</span>
                      )}
                      <span>
                        Reserve: {lot.reservePrice != null ? formatCurrency(lot.reservePrice) : 'none'}
                      </span>
                      <span className="capitalize">{lot.status.replace('_', ' ')}</span>
                    </div>
                    <div className="mt-4 flex flex-wrap items-end gap-6">
                      <div>
                        <p className="text-xs text-muted-foreground">Current Bid</p>
                        <p className="font-display text-3xl text-champagne">
                          {lot.currentBidAmount > 0 ? formatCurrency(lot.currentBidAmount) : '—'}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Bids</p>
                        <p className="font-display text-3xl">{lot.bidCount}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">High bidder</p>
                        <p className="text-base font-medium mt-1" title={lot.currentBidderId ?? undefined}>{highBidderLabel(lot)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Reserve</p>
                        <p className="mt-1">
                          {reserveMet === null ? (
                            <Badge variant="secondary">No reserve</Badge>
                          ) : reserveMet ? (
                            <Badge className="bg-green-100 text-green-800">Reserve met</Badge>
                          ) : (
                            <Badge className="bg-amber-100 text-amber-800">Below reserve</Badge>
                          )}
                        </p>
                      </div>
                      {activeLot.closingAt && (
                        <div>
                          <p className="text-xs text-muted-foreground">Closes</p>
                          <p className="text-base font-medium mt-1 flex items-center gap-1.5 tabular-nums" title={formatWhen(activeLot.closingAt)}>
                            <Clock className="h-4 w-4 text-muted-foreground" />
                            {lot.status === 'sold' || lot.status === 'unsold'
                              ? lot.status === 'sold' ? 'Sold' : 'Unsold'
                              : closeMs !== null ? formatRemaining(closeMs) : '—'}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })()}

        {/* Lot list */}
        <div className="flex-1 overflow-y-auto">
          <div className="space-y-1">
            {lots.map((aLot, i) => {
              const closeMs = aLot.closingAt ? new Date(aLot.closingAt).getTime() - now : null;
              return (
                <button
                  key={aLot.lot.id}
                  onClick={() => setActiveLotIndex(i)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded text-left text-sm transition-colors ${
                    i === activeLotIndex ? 'bg-champagne/10 border border-champagne/30' : 'hover:bg-muted'
                  }`}
                >
                  <span className="text-muted-foreground w-8 shrink-0">#{aLot.lotNumber}</span>
                  <span className="flex-1 truncate">{aLot.lot.title}</span>
                  {isLive && closeMs !== null && aLot.lot.status === 'in_auction' && (
                    <span className="text-muted-foreground text-xs tabular-nums hidden sm:inline">{formatRemaining(closeMs)}</span>
                  )}
                  {(aLot.lot.status === 'sold' || aLot.lot.status === 'unsold') && (
                    <span className="text-xs capitalize text-muted-foreground">{aLot.lot.status}</span>
                  )}
                  <span className="text-muted-foreground tabular-nums">
                    {aLot.lot.currentBidAmount > 0 ? formatCurrency(aLot.lot.currentBidAmount) : '—'}
                  </span>
                  <Gavel className="h-3 w-3 text-muted-foreground" />
                  <span className="text-muted-foreground text-xs w-6 text-right tabular-nums">{aLot.lot.bidCount}</span>
                </button>
              );
            })}
            {lots.length === 0 && (
              <p className="text-sm text-muted-foreground px-3 py-4">No lots catalogued in this sale.</p>
            )}
          </div>
        </div>
      </div>

      {/* Chat sidebar */}
      <div className="w-full lg:w-80 xl:w-96 flex-shrink-0">
        <LiveChat auctionId={auctionId} className="h-full" />
      </div>

      <ConfirmDialog
        open={pending === 'start'}
        onOpenChange={(o) => !o && setPending(null)}
        title="Go live now?"
        description={
          <div className="space-y-2">
            <p>Opens the live session for <strong>{auction?.title}</strong>.</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>All {lots.length} lots become biddable immediately{auction?.status === 'open' ? ' (they already are)' : ''}.</li>
              <li>The sale shows as LIVE on the site and bidders can join the stream.</li>
              <li>Bidding stays open until you end the session (or 12 hours, whichever comes first).</li>
            </ul>
          </div>
        }
        confirmLabel="Go live"
        onConfirm={handleGoLive}
      />
      <ConfirmDialog
        open={pending === 'end'}
        onOpenChange={(o) => !o && setPending(null)}
        title="End the live session?"
        description={
          <div className="space-y-2">
            <p>This stops bidding on every lot at once and cannot be undone.</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>All {openLots} still-open lots are force-closed right now, including any with no bids yet.</li>
              <li>Settlement follows automatically within a few minutes: winners, invoices and unsold lots.</li>
              <li>The video room is shut and viewers are disconnected.</li>
            </ul>
          </div>
        }
        confirmLabel="End live session"
        variant="destructive"
        onConfirm={handleEndLive}
      />
    </div>
  );
}
