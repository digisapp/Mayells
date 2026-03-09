'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Package } from 'lucide-react';
import { formatCurrency } from '@/types';
import { toast } from 'sonner';

interface ConsignmentRow {
  consignment: {
    id: string;
    title: string;
    description: string | null;
    categorySlug: string;
    estimatedValue: number | null;
    status: string;
    reviewNotes: string | null;
    commissionPercent: number | null;
    createdAt: string;
  };
  seller: {
    id: string;
    fullName: string;
    email: string;
  };
}

const statusBadge: Record<string, string> = {
  submitted: 'bg-blue-100 text-blue-800',
  under_review: 'bg-yellow-100 text-yellow-800',
  approved: 'bg-green-100 text-green-800',
  declined: 'bg-red-100 text-red-800',
  listed: 'bg-champagne/20 text-champagne',
  sold: 'bg-green-100 text-green-800',
  returned: 'bg-gray-100 text-gray-800',
};

export default function AdminConsignmentsPage() {
  const [items, setItems] = useState<ConsignmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [reviewStatus, setReviewStatus] = useState('');

  useEffect(() => {
    fetch('/api/admin/consignments')
      .then((r) => r.json())
      .then((d) => setItems(d.data ?? []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  async function handleReview(id: string) {
    try {
      const res = await fetch('/api/admin/consignments', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: reviewStatus, reviewNotes }),
      });

      if (res.ok) {
        toast.success('Consignment updated');
        setReviewingId(null);
        setReviewNotes('');
        setReviewStatus('');
        // Refresh
        const refreshRes = await fetch('/api/admin/consignments');
        const data = await refreshRes.json();
        setItems(data.data ?? []);
      } else {
        const data = await res.json();
        toast.error(data.error || 'Failed to update');
      }
    } catch {
      toast.error('Network error');
    }
  }

  return (
    <div>
      <h1 className="font-display text-display-sm mb-8">Consignment Review</h1>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Package className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">No consignment submissions to review.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {items.map((row) => (
            <Card key={row.consignment.id}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-base">{row.consignment.title}</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      {row.seller.fullName} ({row.seller.email})
                    </p>
                  </div>
                  <Badge className={statusBadge[row.consignment.status] ?? ''} variant="secondary">
                    {row.consignment.status.replace(/_/g, ' ')}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-4 text-sm">
                  <span className="text-muted-foreground">Department: <strong className="text-foreground capitalize">{row.consignment.categorySlug}</strong></span>
                  {row.consignment.estimatedValue && (
                    <span className="text-muted-foreground">Est: <strong className="text-foreground">{formatCurrency(row.consignment.estimatedValue)}</strong></span>
                  )}
                  <span className="text-muted-foreground">Submitted: {new Date(row.consignment.createdAt).toLocaleDateString()}</span>
                </div>

                {row.consignment.description && (
                  <p className="text-sm">{row.consignment.description}</p>
                )}

                {row.consignment.reviewNotes && (
                  <p className="text-sm italic text-muted-foreground">Review: &ldquo;{row.consignment.reviewNotes}&rdquo;</p>
                )}

                {reviewingId === row.consignment.id ? (
                  <div className="space-y-3 border-t pt-3">
                    <Select value={reviewStatus} onValueChange={setReviewStatus}>
                      <SelectTrigger>
                        <SelectValue placeholder="Set status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="under_review">Under Review</SelectItem>
                        <SelectItem value="approved">Approved</SelectItem>
                        <SelectItem value="declined">Declined</SelectItem>
                      </SelectContent>
                    </Select>
                    <Textarea
                      placeholder="Review notes (visible to seller)"
                      value={reviewNotes}
                      onChange={(e) => setReviewNotes(e.target.value)}
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        disabled={!reviewStatus}
                        onClick={() => handleReview(row.consignment.id)}
                        className="bg-champagne text-charcoal hover:bg-champagne/90"
                      >
                        Submit Review
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setReviewingId(null)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setReviewingId(row.consignment.id);
                      setReviewNotes(row.consignment.reviewNotes ?? '');
                    }}
                  >
                    Review
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
