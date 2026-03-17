export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { db } from '@/db';
import { lots, categories } from '@/db/schema';
import { desc, eq } from 'drizzle-orm';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Pencil } from 'lucide-react';
import { formatCurrency } from '@/types';

const statusColors: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-800',
  pending_review: 'bg-yellow-100 text-yellow-800',
  approved: 'bg-blue-100 text-blue-800',
  for_sale: 'bg-green-100 text-green-800',
  in_auction: 'bg-purple-100 text-purple-800',
  sold: 'bg-emerald-100 text-emerald-800',
  unsold: 'bg-red-100 text-red-800',
  withdrawn: 'bg-gray-100 text-gray-600',
};

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
              <TableHead className="w-[50px]"></TableHead>
              <TableHead>Title</TableHead>
              <TableHead>Department</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Price / Estimate</TableHead>
              <TableHead>Bids</TableHead>
              <TableHead className="w-[60px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {allLots.map(({ lot, category }) => (
              <TableRow key={lot.id}>
                <TableCell>
                  {lot.primaryImageUrl ? (
                    <img src={lot.primaryImageUrl} alt={lot.title} className="w-10 h-10 object-cover rounded" />
                  ) : (
                    <div className="w-10 h-10 bg-muted rounded" />
                  )}
                </TableCell>
                <TableCell>
                  <Link href={`/admin/lots/${lot.id}`} className="font-medium hover:underline">
                    {lot.title}
                  </Link>
                </TableCell>
                <TableCell className="text-muted-foreground">{category?.name ?? '—'}</TableCell>
                <TableCell>
                  <Badge variant={lot.saleType === 'auction' ? 'secondary' : 'outline'}>
                    {lot.saleType === 'gallery' ? 'Gallery' : lot.saleType === 'private' ? 'Private' : 'Auction'}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge className={statusColors[lot.status] || ''}>
                    {lot.status.replace('_', ' ')}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {lot.saleType === 'gallery' && lot.buyNowPrice
                    ? formatCurrency(lot.buyNowPrice)
                    : lot.estimateLow && lot.estimateHigh
                      ? `${formatCurrency(lot.estimateLow)} — ${formatCurrency(lot.estimateHigh)}`
                      : '—'}
                </TableCell>
                <TableCell>{lot.bidCount > 0 ? `${lot.bidCount} (${formatCurrency(lot.currentBidAmount)})` : '—'}</TableCell>
                <TableCell>
                  <Link href={`/admin/lots/${lot.id}`}>
                    <Button variant="ghost" size="sm"><Pencil className="h-3.5 w-3.5" /></Button>
                  </Link>
                </TableCell>
              </TableRow>
            ))}
            {allLots.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
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
