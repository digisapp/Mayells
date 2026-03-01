'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useAuth } from '@/context/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Heart, X } from 'lucide-react';
import { formatCurrency } from '@/types';

interface WatchlistItem {
  watchlistId: string;
  createdAt: string;
  lot: {
    id: string;
    title: string;
    lotNumber: number | null;
    primaryImageUrl: string | null;
    currentBidAmount: number;
    bidCount: number;
    estimateLow: number | null;
    estimateHigh: number | null;
    status: string;
    slug: string | null;
    artist: string | null;
  };
}

export default function WatchlistPage() {
  const { isAuthenticated } = useAuth();
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAuthenticated) return;
    fetch('/api/watchlist')
      .then((r) => r.json())
      .then((d) => setItems(d.data ?? []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [isAuthenticated]);

  async function removeFromWatchlist(lotId: string) {
    setItems((prev) => prev.filter((i) => i.lot.id !== lotId));
    try {
      await fetch('/api/watchlist', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lotId }),
      });
    } catch {
      const res = await fetch('/api/watchlist');
      const data = await res.json();
      setItems(data.data ?? []);
    }
  }

  return (
    <div className="max-w-5xl">
      <h1 className="font-display text-display-sm mb-8">Watchlist</h1>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-64 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Heart className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">No saved lots yet.</p>
            <p className="text-sm text-muted-foreground mt-1">Click the heart icon on any lot to add it here.</p>
            <Link href="/lots" className="text-sm text-champagne hover:underline mt-3 inline-block">
              Browse Lots
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((item) => (
            <Card key={item.watchlistId} className="overflow-hidden group">
              <div className="relative aspect-[4/3] bg-muted">
                {item.lot.primaryImageUrl ? (
                  <Image src={item.lot.primaryImageUrl} alt={item.lot.title} fill className="object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm">
                    No image
                  </div>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute top-2 right-2 bg-white/80 hover:bg-white text-red-500 h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => {
                    e.preventDefault();
                    removeFromWatchlist(item.lot.id);
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <Link href={item.lot.slug ? `/lots/${item.lot.slug}` : `/lots/${item.lot.id}`}>
                <CardContent className="p-4">
                  {item.lot.lotNumber && (
                    <p className="text-xs text-muted-foreground mb-1">Lot {item.lot.lotNumber}</p>
                  )}
                  <p className="font-medium truncate">{item.lot.title}</p>
                  {item.lot.artist && (
                    <p className="text-sm text-muted-foreground truncate">{item.lot.artist}</p>
                  )}
                  <div className="mt-3 flex items-end justify-between">
                    <div>
                      {item.lot.currentBidAmount > 0 ? (
                        <>
                          <p className="text-xs text-muted-foreground">Current Bid</p>
                          <p className="font-display text-lg">{formatCurrency(item.lot.currentBidAmount)}</p>
                        </>
                      ) : item.lot.estimateLow ? (
                        <>
                          <p className="text-xs text-muted-foreground">Estimate</p>
                          <p className="text-sm">
                            {formatCurrency(item.lot.estimateLow)} – {formatCurrency(item.lot.estimateHigh ?? item.lot.estimateLow)}
                          </p>
                        </>
                      ) : null}
                    </div>
                    <p className="text-xs text-muted-foreground">{item.lot.bidCount} bids</p>
                  </div>
                </CardContent>
              </Link>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
