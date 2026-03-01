'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useAuth } from '@/context/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Trophy } from 'lucide-react';
import { formatCurrency } from '@/types';

interface BidRow {
  bid: {
    id: string;
    amount: number;
    status: string;
    createdAt: string;
  };
  lot: {
    id: string;
    title: string;
    lotNumber: number | null;
    primaryImageUrl: string | null;
    currentBidAmount: number;
    status: string;
    slug: string | null;
  };
  auction: {
    id: string;
    title: string;
    slug: string | null;
  };
}

export default function WonPage() {
  const { isAuthenticated } = useAuth();
  const [wonItems, setWonItems] = useState<BidRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAuthenticated) return;
    fetch('/api/bids')
      .then((r) => r.json())
      .then((d) => {
        const all: BidRow[] = d.data ?? [];
        setWonItems(all.filter((b) => b.bid.status === 'won'));
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [isAuthenticated]);

  return (
    <div className="max-w-5xl">
      <h1 className="font-display text-display-sm mb-8">Won Lots</h1>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
      ) : wonItems.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Trophy className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">No won lots yet. Keep bidding!</p>
            <Link href="/auctions" className="text-sm text-champagne hover:underline mt-2 inline-block">
              Browse Auctions
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {wonItems.map((row) => {
            const lotUrl = row.auction.slug && row.lot.slug
              ? `/auctions/${row.auction.slug}/lots/${row.lot.slug}`
              : `/auctions/${row.auction.id}/lots/${row.lot.id}`;
            return (
              <Link key={row.bid.id} href={lotUrl}>
                <Card className="hover:border-champagne/50 transition-colors cursor-pointer">
                  <CardContent className="flex items-center gap-4 py-3">
                    <div className="relative w-20 h-20 bg-muted rounded overflow-hidden flex-shrink-0">
                      {row.lot.primaryImageUrl ? (
                        <Image src={row.lot.primaryImageUrl} alt={row.lot.title} fill className="object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">
                          No image
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">
                        {row.lot.lotNumber ? `Lot ${row.lot.lotNumber}: ` : ''}{row.lot.title}
                      </p>
                      <p className="text-sm text-muted-foreground truncate">{row.auction.title}</p>
                      <Badge className="mt-1 bg-champagne/20 text-champagne">Won</Badge>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-xs text-muted-foreground">Hammer Price</p>
                      <p className="font-display text-xl">{formatCurrency(row.bid.amount)}</p>
                      <Link
                        href="/invoices"
                        className="text-xs text-champagne hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        View Invoice
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
