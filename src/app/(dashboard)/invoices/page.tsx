'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { useAuth } from '@/context/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FileText } from 'lucide-react';
import { formatCurrency } from '@/types';

interface InvoiceRow {
  invoice: {
    id: string;
    invoiceNumber: string;
    hammerPrice: number;
    buyerPremium: number;
    shippingCost: number | null;
    totalAmount: number;
    status: string;
    dueDate: string;
    paidAt: string | null;
    createdAt: string;
  };
  lot: {
    id: string;
    title: string;
    lotNumber: number | null;
    primaryImageUrl: string | null;
    slug: string | null;
  };
  auction: {
    id: string;
    title: string;
    slug: string | null;
  };
}

const statusBadge: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  paid: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  overdue: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  cancelled: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200',
  refunded: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
};

export default function InvoicesPage() {
  const { isAuthenticated } = useAuth();
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAuthenticated) return;
    fetch('/api/invoices')
      .then((r) => r.json())
      .then((d) => setInvoices(d.data ?? []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [isAuthenticated]);

  return (
    <div className="max-w-5xl">
      <h1 className="font-display text-display-sm mb-8">Invoices</h1>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
      ) : invoices.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">No invoices yet.</p>
            <p className="text-sm text-muted-foreground mt-1">Invoices are generated when you win a lot.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {invoices.map((row) => (
            <Card key={row.invoice.id} className="hover:border-champagne/50 transition-colors">
              <CardContent className="flex items-center gap-4 py-4">
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
                  <p className="font-medium truncate">
                    {row.lot.lotNumber ? `Lot ${row.lot.lotNumber}: ` : ''}{row.lot.title}
                  </p>
                  <p className="text-sm text-muted-foreground truncate">{row.auction.title}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-muted-foreground">#{row.invoice.invoiceNumber}</span>
                    <Badge className={statusBadge[row.invoice.status] ?? ''} variant="secondary">
                      {row.invoice.status}
                    </Badge>
                  </div>
                </div>
                <div className="text-right flex-shrink-0 space-y-1">
                  <p className="font-display text-xl">{formatCurrency(row.invoice.totalAmount)}</p>
                  <div className="text-xs text-muted-foreground space-y-0.5">
                    <p>Hammer: {formatCurrency(row.invoice.hammerPrice)}</p>
                    <p>Premium: {formatCurrency(row.invoice.buyerPremium)}</p>
                  </div>
                  {row.invoice.status === 'pending' && (
                    <Button size="sm" className="mt-2 bg-champagne text-charcoal hover:bg-champagne/90">
                      Pay Now
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
