export const dynamic = 'force-dynamic';

import { db } from '@/db';
import { auctions } from '@/db/schema';
import { inArray, desc } from 'drizzle-orm';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Radio } from 'lucide-react';

export default async function AdminLivePage() {
  const liveAuctions = await db
    .select()
    .from(auctions)
    .where(inArray(auctions.status, ['live', 'open', 'scheduled', 'preview']))
    .orderBy(desc(auctions.createdAt));

  return (
    <div>
      <h1 className="font-display text-display-sm mb-8">Live Auctions</h1>

      {liveAuctions.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Radio className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">No auctions ready to go live.</p>
            <p className="text-sm text-muted-foreground mt-1">
              Create an auction and set it to &quot;open&quot; or &quot;scheduled&quot; first.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {liveAuctions.map((auction) => (
            <Card key={auction.id}>
              <CardContent className="flex items-center justify-between py-4">
                <div>
                  <p className="font-medium">{auction.title}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant={auction.status === 'live' ? 'destructive' : 'secondary'}>
                      {auction.status === 'live' ? '🔴 LIVE' : auction.status}
                    </Badge>
                    <span className="text-sm text-muted-foreground">{auction.lotCount} lots</span>
                  </div>
                </div>
                <Link href={`/admin/live/${auction.id}`}>
                  <Button className={auction.status === 'live' ? 'bg-red-600 hover:bg-red-700' : 'bg-champagne text-charcoal hover:bg-champagne/90'}>
                    {auction.status === 'live' ? 'Manage Live' : 'Go Live'}
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
