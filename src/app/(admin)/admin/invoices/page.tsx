'use client';

import { useEffect, useState, useCallback } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { FileText, CheckCircle, XCircle, RotateCcw, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
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

interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

interface InvoiceStats {
  pending: number;
  overdue: number;
  paidTotal: number;
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
  const [pagination, setPagination] = useState<Pagination>({ page: 1, pageSize: 50, total: 0, totalPages: 0 });
  const [stats, setStats] = useState<InvoiceStats>({ pending: 0, overdue: 0, paidTotal: 0 });
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const fetchInvoices = useCallback((page: number, silent = false) => {
    if (!silent) setLoading(true);
    fetch(`/api/admin/invoices?page=${page}`)
      .then((r) => {
        if (!r.ok) throw new Error('Failed to load invoices');
        return r.json();
      })
      .then((d) => {
        setInvoices(d.data ?? []);
        if (d.pagination) setPagination(d.pagination);
        if (d.stats) setStats(d.stats);
      })
      .catch(() => toast.error('Failed to load invoices'))
      .finally(() => {
        if (!silent) setLoading(false);
      });
  }, []);

  useEffect(() => {
    fetchInvoices(pagination.page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagination.page]);

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
        // Refresh header stats without flashing the table skeleton
        fetchInvoices(pagination.page, true);
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

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-display-sm flex items-center gap-3">
            <FileText className="h-6 w-6" />
            Invoices
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{pagination.total} total</p>
        </div>
        <div className="flex gap-4 text-sm">
          {stats.pending > 0 && (
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-yellow-500" />
              {stats.pending} pending
            </span>
          )}
          {stats.overdue > 0 && (
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-red-500" />
              {stats.overdue} overdue
            </span>
          )}
          {stats.paidTotal > 0 && (
            <span className="text-muted-foreground">
              {formatCurrency(stats.paidTotal)} collected
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
        <>
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
                          {(invoice.status === 'pending' || invoice.status === 'overdue') && (
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

        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-between mt-4 text-sm">
            <p className="text-muted-foreground">
              Page {pagination.page} of {pagination.totalPages}
            </p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={pagination.page <= 1}
                onClick={() => setPagination((p) => ({ ...p, page: p.page - 1 }))} className="gap-1">
                <ChevronLeft className="h-3.5 w-3.5" /> Prev
              </Button>
              <Button size="sm" variant="outline" disabled={pagination.page >= pagination.totalPages}
                onClick={() => setPagination((p) => ({ ...p, page: p.page + 1 }))} className="gap-1">
                Next <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}
        </>
      )}
    </div>
  );
}
