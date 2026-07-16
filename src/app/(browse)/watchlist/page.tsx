export const dynamic = 'force-dynamic';

import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { redirect } from 'next/navigation';
import { db } from '@/db';
import { watchlist, lots, auctionLots } from '@/db/schema';
import { eq, desc, sql } from 'drizzle-orm';
import { createClient } from '@/lib/supabase/server';
import { formatCurrency } from '@/types';
import { Badge } from '@/components/ui/badge';
import { AuctionCountdown } from '@/components/auctions/AuctionCountdown';
import { SavedSearchList } from '@/components/search/SavedSearchList';
import { Heart } from 'lucide-react';

export const metadata: Metadata = {
  title: 'My Watchlist',
  robots: { index: false, follow: false },
};

export default async function WatchlistPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/watchlist');

  const rows = await db
    .select({
      lotId: lots.id,
      title: lots.title,
      slug: lots.slug,
      primaryImageUrl: lots.primaryImageUrl,
      currentBidAmount: lots.currentBidAmount,
      bidCount: lots.bidCount,
      estimateLow: lots.estimateLow,
      estimateHigh: lots.estimateHigh,
      status: lots.status,
      closingAt: sql<string | null>`(
        SELECT MIN(${auctionLots.closingAt}) FROM ${auctionLots}
        WHERE ${auctionLots.lotId} = ${lots.id} AND ${auctionLots.closingAt} > now()
      )`,
    })
    .from(watchlist)
    .innerJoin(lots, eq(lots.id, watchlist.lotId))
    .where(eq(watchlist.userId, user.id))
    .orderBy(desc(watchlist.createdAt));

  // Server renders once per request — authoritative time for countdown skew.
  // eslint-disable-next-line react-hooks/purity
  const serverNow = Date.now();

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="flex items-center gap-3 mb-8">
        <Heart className="h-6 w-6 text-red-500 fill-current" />
        <h1 className="font-display text-display-lg">My Watchlist</h1>
      </div>

      <SavedSearchList />

      {rows.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-muted-foreground mb-4">You&apos;re not watching any lots yet.</p>
          <Link href="/auctions" className="text-champagne hover:underline">Browse auctions →</Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {rows.map((lot) => {
            const href = `/lots/${lot.slug || lot.lotId}`;
            const isLive = lot.status === 'in_auction' && !!lot.closingAt;
            return (
              <Link
                key={lot.lotId}
                href={href}
                className="group border border-border/50 rounded-xl overflow-hidden hover:shadow-luxury transition-shadow"
              >
                <div className="relative aspect-[4/3] bg-muted">
                  {lot.primaryImageUrl ? (
                    <Image src={lot.primaryImageUrl} alt={lot.title} fill className="object-cover" sizes="(max-width:768px) 100vw, 33vw" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm">No image</div>
                  )}
                  {lot.status === 'sold' && (
                    <Badge className="absolute top-3 left-3 bg-charcoal text-white">Sold</Badge>
                  )}
                </div>
                <div className="p-4">
                  <h2 className="font-display text-lg line-clamp-1">{lot.title}</h2>
                  <div className="mt-2 flex items-end justify-between">
                    <div>
                      {lot.currentBidAmount > 0 ? (
                        <>
                          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Current Bid</p>
                          <p className="font-display text-xl">{formatCurrency(lot.currentBidAmount)}</p>
                        </>
                      ) : lot.estimateLow && lot.estimateHigh ? (
                        <>
                          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Estimate</p>
                          <p className="font-display text-base">{formatCurrency(lot.estimateLow)} — {formatCurrency(lot.estimateHigh)}</p>
                        </>
                      ) : null}
                    </div>
                    {isLive && lot.closingAt && (
                      <AuctionCountdown endsAt={new Date(lot.closingAt)} serverNow={serverNow} variant="inline" className="text-sm" />
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
