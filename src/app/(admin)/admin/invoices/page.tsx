export const dynamic = 'force-dynamic';

import { db } from '@/db';
import { invoices, users, lots } from '@/db/schema';
import { desc, eq } from 'drizzle-orm';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatCurrency } from '@/types';

const statusColors: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  paid: 'bg-green-100 text-green-800',
  overdue: 'bg-red-100 text-red-800',
  cancelled: 'bg-gray-100 text-gray-600',
  refunded: 'bg-blue-100 text-blue-800',
};

export default async function AdminInvoicesPage() {
  const allInvoices = await db
    .select({
      invoice: invoices,
      buyer: { fullName: users.fullName, email: users.email },
      lot: { title: lots.title },
    })
    .from(invoices)
    .innerJoin(users, eq(invoices.buyerId, users.id))
    .innerJoin(lots, eq(invoices.lotId, lots.id))
    .orderBy(desc(invoices.createdAt))
    .limit(200);

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="font-display text-display-sm">Invoices</h1>
        <span className="text-sm text-muted-foreground">{allInvoices.length} total</span>
      </div>

      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Invoice #</TableHead>
              <TableHead>Buyer</TableHead>
              <TableHead>Lot</TableHead>
              <TableHead>Hammer Price</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Due Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {allInvoices.map(({ invoice, buyer, lot }) => (
              <TableRow key={invoice.id}>
                <TableCell className="font-medium font-mono text-sm">{invoice.invoiceNumber}</TableCell>
                <TableCell>
                  <div>{buyer.fullName || '—'}</div>
                  <div className="text-xs text-muted-foreground">{buyer.email}</div>
                </TableCell>
                <TableCell className="text-muted-foreground max-w-[200px] truncate">{lot.title}</TableCell>
                <TableCell>{formatCurrency(invoice.hammerPrice)}</TableCell>
                <TableCell className="font-medium">{formatCurrency(invoice.totalAmount)}</TableCell>
                <TableCell>
                  <Badge className={statusColors[invoice.status] || ''}>{invoice.status}</Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {new Date(invoice.dueDate).toLocaleDateString()}
                </TableCell>
              </TableRow>
            ))}
            {allInvoices.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">No invoices yet.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
