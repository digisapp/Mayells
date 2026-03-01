'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useAuth } from '@/context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Gavel } from 'lucide-react';
import { formatCurrency } from '@/types';

interface BidRow {
  bid: {
    id: string;
    amount: number;
    status: string;
    bidType: string;
    createdAt: string;
  };
  lot: {
    id: string;
    title: string;
    lotNumber: number | null;
    primaryImageUrl: string | null;
    currentBidAmount: number;
    currentBidderId: string | null;
    bidCount: number;
    estimateLow: number | null;
    estimateHigh: number | null;
    status: string;
    slug: string | null;
  };
  auction: {
    id: string;
    title: string;
    slug: string | null;
    biddingEndsAt: string | null;
    status: string;
  };
}

const statusColors: Record<string, string> = {
  winning: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  won: 'bg-champagne/20 text-champagne',
  active: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  outbid: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  retracted: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200',
};

export default function BidsPage() {
  const { isAuthenticated } = useAuth();
  const [bids, setBids] = useState<BidRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAuthenticated) return;
    fetch('/api/bids')
      .then((r) => r.json())
      .then((d) => setBids(d.data ?? []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [isAuthenticated]);

  const activeBids = bids.filter((b) => b.bid.status === 'winning' || b.bid.status === 'active');
  const pastBids = bids.filter((b) => b.bid.status === 'outbid' || b.bid.status === 'won' || b.bid.status === 'retracted');

  return (
    <div className="max-w-5xl">
      <h1 className="font-display text-display-sm mb-8">My Bids</h1>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
      ) : bids.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Gavel className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">No bids yet. Browse auctions to start bidding.</p>
            <Link href="/auctions" className="text-sm text-champagne hover:underline mt-2 inline-block">
              Browse Auctions
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          {activeBids.length > 0 && (
            <section>
              <h2 className="font-display text-lg mb-4">Active Bids ({activeBids.length})</h2>
              <div className="space-y-3">
                {activeBids.map((row) => (
                  <BidRow key={row.bid.id} row={row} />
                ))}
              </div>
            </section>
          )}

          {pastBids.length > 0 && (
            <section>
              <h2 className="font-display text-lg mb-4">Past Bids ({pastBids.length})</h2>
              <div className="space-y-3">
                {pastBids.map((row) => (
                  <BidRow key={row.bid.id} row={row} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function BidRow({ row }: { row: BidRow }) {
  const lotUrl = row.auction.slug && row.lot.slug
    ? `/auctions/${row.auction.slug}/lots/${row.lot.slug}`
    : `/auctions/${row.auction.id}/lots/${row.lot.id}`;

  return (
    <Link href={lotUrl}>
      <Card className="hover:border-champagne/50 transition-colors cursor-pointer">
        <CardContent className="flex items-center gap-4 py-3">
          <div className="relative w-16 h-16 bg-muted rounded overflow-hidden flex-shrink-0">
            {row.lot.primaryImageUrl ? (
              <Image src={row.lot.primaryImageUrl} alt={row.lot.title} fill className="object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">
                No image
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium truncate">{row.lot.lotNumber ? `Lot ${row.lot.lotNumber}: ` : ''}{row.lot.title}</p>
            <p className="text-sm text-muted-foreground truncate">{row.auction.title}</p>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="font-display text-lg">{formatCurrency(row.bid.amount)}</p>
            <Badge className={statusColors[row.bid.status] ?? ''} variant="secondary">
              {row.bid.status}
            </Badge>
          </div>
          <div className="text-right flex-shrink-0 hidden sm:block">
            <p className="text-xs text-muted-foreground">Current</p>
            <p className="font-medium">{formatCurrency(row.lot.currentBidAmount)}</p>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
