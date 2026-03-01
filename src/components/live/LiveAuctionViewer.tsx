'use client';

import { useState } from 'react';
import Image from 'next/image';
import { LiveVideoPlayer } from './LiveVideoPlayer';
import { LiveChat } from './LiveChat';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/types';

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

interface LiveAuctionViewerProps {
  auction: { id: string; title: string; slug: string };
  lots: AuctionLot[];
}

export function LiveAuctionViewer({ auction, lots }: LiveAuctionViewerProps) {
  const [activeLotIndex, setActiveLotIndex] = useState(0);
  const activeLot = lots[activeLotIndex];

  return (
    <div className="min-h-screen bg-[#0E1117] text-white">
      {/* Top bar */}
      <div className="border-b border-white/10 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="font-display text-lg tracking-wider text-champagne">MAYELLS</span>
          <Badge className="bg-red-600 text-white">LIVE</Badge>
          <span className="text-white/60 text-sm">{auction.title}</span>
        </div>
        <span className="text-white/40 text-sm">{lots.length} lots</span>
      </div>

      {/* Main layout */}
      <div className="flex flex-col lg:flex-row h-[calc(100vh-57px)]">
        {/* Video + Current Lot */}
        <div className="flex-1 flex flex-col min-w-0">
          <LiveVideoPlayer auctionId={auction.id} className="flex-shrink-0" />

          {/* Current lot info */}
          {activeLot && (
            <div className="p-4 border-t border-white/10 flex-shrink-0">
              <div className="flex items-start gap-4">
                {activeLot.lot.primaryImageUrl && (
                  <div className="relative w-20 h-20 rounded overflow-hidden flex-shrink-0">
                    <Image src={activeLot.lot.primaryImageUrl} alt={activeLot.lot.title} fill className="object-cover" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-white/50 text-xs">Lot {activeLot.lotNumber}</p>
                  <p className="font-medium text-white truncate">{activeLot.lot.title}</p>
                  {activeLot.lot.estimateLow && (
                    <p className="text-white/40 text-xs mt-1">
                      Est. {formatCurrency(activeLot.lot.estimateLow)} – {formatCurrency(activeLot.lot.estimateHigh ?? activeLot.lot.estimateLow)}
                    </p>
                  )}
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-white/50 text-xs">Current Bid</p>
                  <p className="font-display text-2xl text-champagne">
                    {activeLot.lot.currentBidAmount > 0 ? formatCurrency(activeLot.lot.currentBidAmount) : '—'}
                  </p>
                  <p className="text-white/40 text-xs">{activeLot.lot.bidCount} bids</p>
                </div>
              </div>
            </div>
          )}

          {/* Lot navigator */}
          <div className="flex-1 overflow-y-auto p-4 border-t border-white/10">
            <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
              {lots.map((aLot, i) => (
                <button
                  key={aLot.lot.id}
                  onClick={() => setActiveLotIndex(i)}
                  className={cn(
                    'relative aspect-square rounded overflow-hidden border-2 transition-colors',
                    i === activeLotIndex ? 'border-champagne' : 'border-transparent hover:border-white/20',
                  )}
                >
                  {aLot.lot.primaryImageUrl ? (
                    <Image src={aLot.lot.primaryImageUrl} alt={aLot.lot.title} fill className="object-cover" />
                  ) : (
                    <div className="w-full h-full bg-white/5 flex items-center justify-center text-white/30 text-xs">
                      {aLot.lotNumber}
                    </div>
                  )}
                  <div className="absolute bottom-0 inset-x-0 bg-black/60 text-center">
                    <span className="text-[10px] text-white/80">Lot {aLot.lotNumber}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Chat sidebar */}
        <div className="w-full lg:w-80 xl:w-96 border-l border-white/10 flex-shrink-0">
          <LiveChat auctionId={auction.id} className="h-full rounded-none border-0" />
        </div>
      </div>
    </div>
  );
}
