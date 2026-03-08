'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Package, Plus } from 'lucide-react';
import { formatCurrency } from '@/types';

interface ConsignmentItem {
  id: string;
  title: string;
  description: string | null;
  categorySlug: string;
  estimatedValue: number | null;
  status: string;
  reviewNotes: string | null;
  createdAt: string;
}

const statusBadge: Record<string, string> = {
  submitted: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  under_review: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  approved: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  declined: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  listed: 'bg-champagne/20 text-champagne',
  sold: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  returned: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200',
};

export default function ConsignPage() {
  const { isAuthenticated } = useAuth();
  const [items, setItems] = useState<ConsignmentItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAuthenticated) return;
    fetch('/api/consignments')
      .then((r) => r.json())
      .then((d) => setItems(d.data ?? []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [isAuthenticated]);

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-8">
        <h1 className="font-display text-display-sm">Consignments</h1>
        <Link href="/consign">
          <Button className="gap-2 bg-champagne text-charcoal hover:bg-champagne/90">
            <Plus className="h-4 w-4" /> New Consignment
          </Button>
        </Link>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Package className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">No consignment submissions yet.</p>
            <Link href="/consign" className="text-sm text-champagne hover:underline mt-2 inline-block">
              Submit an item for review
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <Card key={item.id} className="hover:border-champagne/50 transition-colors">
              <CardContent className="flex items-center gap-4 py-4">
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{item.title}</p>
                  <p className="text-sm text-muted-foreground capitalize">{item.categorySlug.replace(/-/g, ' ')}</p>
                  {item.reviewNotes && (
                    <p className="text-sm text-muted-foreground mt-1 italic">&ldquo;{item.reviewNotes}&rdquo;</p>
                  )}
                </div>
                <div className="text-right flex-shrink-0 space-y-1">
                  <Badge className={statusBadge[item.status] ?? ''} variant="secondary">
                    {item.status.replace(/_/g, ' ')}
                  </Badge>
                  {item.estimatedValue && (
                    <p className="text-sm text-muted-foreground">Est. {formatCurrency(item.estimatedValue)}</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {new Date(item.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
