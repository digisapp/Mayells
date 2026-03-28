'use client';

import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { FileText, CheckCircle, XCircle, RotateCcw, Loader2 } from 'lucide-react';
import { formatCurrency } from '@/types';
import { toast } from 'sonner';

interface InvoiceRow {
  id: string;
  invoiceNumber: string;
  hammerPrice: number;
  buyerPremium: number;
  totalAmount: number;
  status: string;
  dueDate: string;
  paidAt: string | null;
  buyerName: string | null;
  buyerEmail: string;
  lotTitle: string;
}

const statusColors: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  paid: 'bg-green-100 text-green-800',
  overdue: 'bg-red-100 text-red-800',
  cancelled: 'bg-gray-100 text-gray-600',
  refunded: 'bg-blue-100 text-blue-800',
};

export default function AdminInvoicesPage() {
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/admin/invoices')
      .then((r) => r.json())
      .then((d) => setInvoices(d.data ?? []))
      .catch(() => toast.error('Failed to load invoices'))
      .finally(() => setLoading(false));
  }, []);

  async function updateStatus(id: string, status: string) {
    setUpdatingId(id);
    try {
      const res = await fetch('/api/admin/invoices', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      });
      if (res.ok) {
        setInvoices((prev) =>
          prev.map((inv) => (inv.id === id ? { ...inv, status } : inv))
        );
        toast.success(`Invoice marked as ${status}`);
      } else {
        const data = await res.json();
        toast.error(data.error || 'Failed to update');
      }
    } catch {
      toast.error('Network error');
    } finally {
      setUpdatingId(null);
    }
  }

  const pendingCount = invoices.filter((i) => i.status === 'pending').length;
  const overdueCount = invoices.filter((i) => i.status === 'overdue').length;
  const paidTotal = invoices
    .filter((i) => i.status === 'paid')
    .reduce((sum, i) => sum + i.totalAmount, 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-display-sm flex items-center gap-3">
            <FileText className="h-6 w-6" />
            Invoices
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{invoices.length} total</p>
        </div>
        <div className="flex gap-4 text-sm">
          {pendingCount > 0 && (
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-yellow-500" />
              {pendingCount} pending
            </span>
          )}
          {overdueCount > 0 && (
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-red-500" />
              {overdueCount} overdue
            </span>
          )}
          {paidTotal > 0 && (
            <span className="text-muted-foreground">
              {formatCurrency(paidTotal)} collected
            </span>
          )}
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-12 bg-muted animate-pulse rounded" />
          ))}
        </div>
      ) : (
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
                <TableHead className="w-[120px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.map((invoice) => (
                <TableRow key={invoice.id}>
                  <TableCell className="font-medium font-mono text-sm">
                    {invoice.invoiceNumber}
                  </TableCell>
                  <TableCell>
                    <div>{invoice.buyerName || '—'}</div>
                    <div className="text-xs text-muted-foreground">{invoice.buyerEmail}</div>
                  </TableCell>
                  <TableCell className="text-muted-foreground max-w-[200px] truncate">
                    {invoice.lotTitle}
                  </TableCell>
                  <TableCell>{formatCurrency(invoice.hammerPrice)}</TableCell>
                  <TableCell className="font-medium">{formatCurrency(invoice.totalAmount)}</TableCell>
                  <TableCell>
                    <Badge className={statusColors[invoice.status] || ''}>{invoice.status}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(invoice.dueDate).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {updatingId === invoice.id ? (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      ) : (
                        <>
                          {(invoice.status === 'pending' || invoice.status === 'overdue') && (
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              title="Mark as paid"
                              onClick={() => updateStatus(invoice.id, 'paid')}
                            >
                              <CheckCircle className="h-3.5 w-3.5 text-green-600" />
                            </Button>
                          )}
                          {invoice.status === 'pending' && (
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              title="Cancel invoice"
                              onClick={() => updateStatus(invoice.id, 'cancelled')}
                            >
                              <XCircle className="h-3.5 w-3.5 text-red-500" />
                            </Button>
                          )}
                          {invoice.status === 'paid' && (
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              title="Refund"
                              onClick={() => updateStatus(invoice.id, 'refunded')}
                            >
                              <RotateCcw className="h-3.5 w-3.5 text-blue-500" />
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {invoices.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                    No invoices yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
