export const dynamic = 'force-dynamic';

import { db } from '@/db';
import { auctions } from '@/db/schema';
import { and, desc, eq, inArray, or } from 'drizzle-orm';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Radio } from 'lucide-react';

function formatWhen(d: Date | null) {
  if (!d) return null;
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(d);
}

export default async function AdminLivePage() {
  // The console is for auctioneer-led sales: live-format auctions awaiting
  // their session, plus anything currently broadcasting. Timed sales open and
  // settle on their own schedule and never belong here.
  const liveAuctions = await db
    .select()
    .from(auctions)
    .where(
      or(
        eq(auctions.status, 'live'),
        and(eq(auctions.type, 'live'), inArray(auctions.status, ['scheduled', 'preview', 'open'])),
      ),
    )
    .orderBy(desc(auctions.status), desc(auctions.biddingStartsAt));

  return (
    <div>
      <div className="mb-8">
        <h1 className="font-display text-display-sm">Live Auctions</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Auctioneer console for live-format sales. Timed sales open and settle automatically and are managed under Auctions.
        </p>
      </div>

      {liveAuctions.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Radio className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">No live-format sales are scheduled.</p>
            <p className="text-sm text-muted-foreground mt-1">
              Create an auction with the format set to <strong>Live</strong> and move it to scheduled or preview.
            </p>
            <Button asChild variant="outline" size="sm" className="mt-4">
              <Link href="/admin/auctions/new">New auction</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {liveAuctions.map((auction) => {
            const isLive = auction.status === 'live';
            const when = formatWhen(auction.biddingStartsAt);
            return (
              <Card key={auction.id}>
                <CardContent className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 py-4">
                  <div className="min-w-0">
                    <Link href={`/admin/auctions/${auction.id}`} className="font-medium hover:underline">
                      {auction.title}
                    </Link>
                    <div className="flex flex-wrap items-center gap-2 mt-1 text-sm text-muted-foreground">
                      <Badge variant={isLive ? 'destructive' : 'secondary'}>
                        {isLive ? '● LIVE' : auction.status}
                      </Badge>
                      <span>{auction.lotCount} lots</span>
                      {when && <span>· {isLive ? 'started' : 'scheduled'} {when}</span>}
                      {auction.totalBids > 0 && <span>· {auction.totalBids} bids</span>}
                    </div>
                  </div>
                  <Button asChild className={isLive ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-champagne text-charcoal hover:bg-champagne/90'}>
                    <Link href={`/admin/live/${auction.id}`}>{isLive ? 'Open console' : 'Prepare & go live'}</Link>
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
