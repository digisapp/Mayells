'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LiveChat } from '@/components/live/LiveChat';
import { formatCurrency } from '@/types';
import { toast } from 'sonner';
import { Radio, Play, Square, ChevronLeft, ChevronRight, Gavel } from 'lucide-react';

interface AuctionLot {
  lotNumber: number;
  lot: {
    id: string;
    title: string;
    primaryImageUrl: string | null;
    currentBidAmount: number;
    bidCount: number;
    estimateLow: number | null;
    estimateHigh: number | null;
  };
}

interface AuctionData {
  id: string;
  title: string;
  status: string;
}

export default function AuctioneerDashboardPage() {
  const params = useParams();
  const router = useRouter();
  const auctionId = params.auctionId as string;

  const [auction, setAuction] = useState<AuctionData | null>(null);
  const [lots, setLots] = useState<AuctionLot[]>([]);
  const [activeLotIndex, setActiveLotIndex] = useState(0);
  const [isLive, setIsLive] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [aRes, lRes] = await Promise.all([
          fetch(`/api/auctions/${auctionId}`),
          fetch(`/api/auctions/${auctionId}/lots`),
        ]);
        const aData = await aRes.json();
        const lData = await lRes.json();
        setAuction(aData.data);
        setLots(lData.data ?? []);
        setIsLive(aData.data?.status === 'live');
      } catch {
        toast.error('Failed to load auction');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [auctionId]);

  async function handleGoLive() {
    try {
      const res = await fetch(`/api/live/${auctionId}/start`, { method: 'POST' });
      if (res.ok) {
        setIsLive(true);
        toast.success('Auction is now LIVE!');
      } else {
        const data = await res.json();
        toast.error(data.error || 'Failed to start');
      }
    } catch {
      toast.error('Network error');
    }
  }

  async function handleEndLive() {
    try {
      const res = await fetch(`/api/live/${auctionId}/end`, { method: 'POST' });
      if (res.ok) {
        setIsLive(false);
        toast.success('Live auction ended');
        router.push('/admin/live');
      } else {
        const data = await res.json();
        toast.error(data.error || 'Failed to end');
      }
    } catch {
      toast.error('Network error');
    }
  }

  const activeLot = lots[activeLotIndex];

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
        {/* Auction header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="font-display text-xl">{auction?.title}</h1>
            <div className="flex items-center gap-2 mt-1">
              {isLive ? (
                <Badge className="bg-red-600 text-white animate-pulse">🔴 LIVE</Badge>
              ) : (
                <Badge variant="secondary">Not Live</Badge>
              )}
              <span className="text-sm text-muted-foreground">{lots.length} lots</span>
            </div>
          </div>
          <div className="flex gap-2">
            {!isLive ? (
              <Button onClick={handleGoLive} className="bg-red-600 hover:bg-red-700 text-white gap-2">
                <Play className="h-4 w-4" /> Go Live
              </Button>
            ) : (
              <Button onClick={handleEndLive} variant="destructive" className="gap-2">
                <Square className="h-4 w-4" /> End Live
              </Button>
            )}
          </div>
        </div>

        {/* Current lot */}
        {activeLot && (
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
                {activeLot.lot.primaryImageUrl && (
                  <div className="relative w-32 h-32 rounded overflow-hidden flex-shrink-0">
                    <Image src={activeLot.lot.primaryImageUrl} alt={activeLot.lot.title} fill className="object-cover" />
                  </div>
                )}
                <div className="flex-1">
                  <h2 className="font-display text-lg">{activeLot.lot.title}</h2>
                  {activeLot.lot.estimateLow && (
                    <p className="text-sm text-muted-foreground mt-1">
                      Estimate: {formatCurrency(activeLot.lot.estimateLow)} – {formatCurrency(activeLot.lot.estimateHigh ?? activeLot.lot.estimateLow)}
                    </p>
                  )}
                  <div className="mt-4 flex items-center gap-6">
                    <div>
                      <p className="text-xs text-muted-foreground">Current Bid</p>
                      <p className="font-display text-3xl text-champagne">
                        {activeLot.lot.currentBidAmount > 0 ? formatCurrency(activeLot.lot.currentBidAmount) : '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Bids</p>
                      <p className="font-display text-3xl">{activeLot.lot.bidCount}</p>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Lot list */}
        <div className="flex-1 overflow-y-auto">
          <div className="space-y-1">
            {lots.map((aLot, i) => (
              <button
                key={aLot.lot.id}
                onClick={() => setActiveLotIndex(i)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded text-left text-sm transition-colors ${
                  i === activeLotIndex ? 'bg-champagne/10 border border-champagne/30' : 'hover:bg-muted'
                }`}
              >
                <span className="text-muted-foreground w-8">#{aLot.lotNumber}</span>
                <span className="flex-1 truncate">{aLot.lot.title}</span>
                <span className="text-muted-foreground">
                  {aLot.lot.currentBidAmount > 0 ? formatCurrency(aLot.lot.currentBidAmount) : '—'}
                </span>
                <Gavel className="h-3 w-3 text-muted-foreground" />
                <span className="text-muted-foreground text-xs">{aLot.lot.bidCount}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Chat sidebar */}
      <div className="w-full lg:w-80 xl:w-96 flex-shrink-0">
        <LiveChat auctionId={auctionId} className="h-full" />
      </div>
    </div>
  );
}
