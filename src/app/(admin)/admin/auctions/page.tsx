export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { db } from '@/db';
import { auctions } from '@/db/schema';
import { desc } from 'drizzle-orm';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus } from 'lucide-react';

export default async function AdminAuctionsPage() {
  const allAuctions = await db
    .select()
    .from(auctions)
    .orderBy(desc(auctions.createdAt))
    .limit(50);

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="font-display text-display-sm">Auctions</h1>
        <Link href="/admin/auctions/new">
          <Button className="gap-2"><Plus className="h-4 w-4" /> New Auction</Button>
        </Link>
      </div>

      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Lots</TableHead>
              <TableHead>Premium</TableHead>
              <TableHead>Starts</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {allAuctions.map((auction) => (
              <TableRow key={auction.id}>
                <TableCell>
                  <Link href={`/admin/auctions/${auction.id}`} className="font-medium hover:underline">
                    {auction.title}
                  </Link>
                </TableCell>
                <TableCell className="capitalize">{auction.type}</TableCell>
                <TableCell>
                  <Badge variant={auction.status === 'open' ? 'default' : 'secondary'}>
                    {auction.status}
                  </Badge>
                </TableCell>
                <TableCell>{auction.lotCount}</TableCell>
                <TableCell>{auction.buyerPremiumPercent}%</TableCell>
                <TableCell className="text-muted-foreground">
                  {auction.biddingStartsAt
                    ? new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(new Date(auction.biddingStartsAt))
                    : '—'}
                </TableCell>
              </TableRow>
            ))}
            {allAuctions.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  No auctions yet. Create your first auction.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
