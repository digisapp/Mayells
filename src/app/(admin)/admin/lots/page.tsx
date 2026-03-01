export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { db } from '@/db';
import { lots, categories } from '@/db/schema';
import { desc, eq } from 'drizzle-orm';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus } from 'lucide-react';
import { formatCurrency } from '@/types';

export default async function AdminLotsPage() {
  const allLots = await db
    .select({ lot: lots, category: categories })
    .from(lots)
    .leftJoin(categories, eq(lots.categoryId, categories.id))
    .orderBy(desc(lots.createdAt))
    .limit(100);

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="font-display text-display-sm">Lots</h1>
        <Link href="/admin/lots/new">
          <Button className="gap-2"><Plus className="h-4 w-4" /> New Lot</Button>
        </Link>
      </div>

      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Estimate</TableHead>
              <TableHead>Current Bid</TableHead>
              <TableHead>Bids</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {allLots.map(({ lot, category }) => (
              <TableRow key={lot.id}>
                <TableCell>
                  <Link href={`/admin/lots/${lot.id}`} className="font-medium hover:underline">
                    {lot.title}
                  </Link>
                </TableCell>
                <TableCell className="text-muted-foreground">{category?.name ?? '—'}</TableCell>
                <TableCell>
                  <Badge variant={lot.status === 'in_auction' ? 'default' : 'secondary'}>
                    {lot.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {lot.estimateLow && lot.estimateHigh
                    ? `${formatCurrency(lot.estimateLow)} — ${formatCurrency(lot.estimateHigh)}`
                    : '—'}
                </TableCell>
                <TableCell>{lot.currentBidAmount > 0 ? formatCurrency(lot.currentBidAmount) : '—'}</TableCell>
                <TableCell>{lot.bidCount}</TableCell>
              </TableRow>
            ))}
            {allLots.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  No lots yet. Create your first lot.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
