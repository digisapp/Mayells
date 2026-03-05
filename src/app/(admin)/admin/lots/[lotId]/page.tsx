'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { LotForm, type LotFormData } from '@/components/admin/LotForm';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';

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

const statusTransitions: Record<string, string[]> = {
  draft: ['pending_review', 'approved', 'for_sale'],
  pending_review: ['approved', 'draft'],
  approved: ['for_sale', 'in_auction', 'draft'],
  for_sale: ['withdrawn', 'draft'],
  in_auction: ['sold', 'unsold'],
  sold: [],
  unsold: ['for_sale', 'draft'],
  withdrawn: ['draft'],
};

export default function EditLotPage() {
  const router = useRouter();
  const { lotId } = useParams<{ lotId: string }>();
  const [lot, setLot] = useState<Record<string, unknown> | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetch(`/api/lots/${lotId}`)
      .then((r) => r.json())
      .then((d) => setLot(d.data))
      .catch(() => toast.error('Failed to load lot'));
  }, [lotId]);

  if (!lot) {
    return <div className="text-muted-foreground">Loading...</div>;
  }

  const formData: LotFormData = {
    title: (lot.title as string) || '',
    subtitle: (lot.subtitle as string) || '',
    description: (lot.description as string) || '',
    categoryId: (lot.categoryId as string) || '',
    saleType: (lot.saleType as 'auction' | 'gallery' | 'private') || 'auction',
    artist: (lot.artist as string) || '',
    maker: (lot.maker as string) || '',
    period: (lot.period as string) || '',
    circa: (lot.circa as string) || '',
    origin: (lot.origin as string) || '',
    medium: (lot.medium as string) || '',
    dimensions: (lot.dimensions as string) || '',
    weight: (lot.weight as string) || '',
    condition: (lot.condition as string) || '',
    conditionNotes: (lot.conditionNotes as string) || '',
    provenance: (lot.provenance as string) || '',
    estimateLow: lot.estimateLow ? String((lot.estimateLow as number) / 100) : '',
    estimateHigh: lot.estimateHigh ? String((lot.estimateHigh as number) / 100) : '',
    reservePrice: lot.reservePrice ? String((lot.reservePrice as number) / 100) : '',
    startingBid: lot.startingBid ? String((lot.startingBid as number) / 100) : '',
    buyNowPrice: lot.buyNowPrice ? String((lot.buyNowPrice as number) / 100) : '',
  };

  const images = ((lot.images as Array<{ id: string; url: string; isPrimary: boolean }>) || []).map((img) => ({
    id: img.id,
    url: img.url,
    isPrimary: img.isPrimary,
  }));

  const status = (lot.status as string) || 'draft';
  const transitions = statusTransitions[status] || [];

  async function updateStatus(newStatus: string) {
    const res = await fetch(`/api/lots/${lotId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
    if (res.ok) {
      setLot((prev) => prev ? { ...prev, status: newStatus } : prev);
      toast.success(`Status updated to ${newStatus.replace('_', ' ')}`);
    } else {
      toast.error('Failed to update status');
    }
  }

  async function handleSubmit(data: Record<string, unknown>) {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/lots/${lotId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error);
      toast.success('Lot updated');
      router.push('/admin/lots');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleDelete() {
    if (!confirm('Delete this lot? This cannot be undone.')) return;
    setDeleting(true);
    const res = await fetch(`/api/lots/${lotId}`, { method: 'DELETE' });
    if (res.ok) {
      toast.success('Lot deleted');
      router.push('/admin/lots');
    } else {
      const data = await res.json();
      toast.error(data.error || 'Failed to delete');
      setDeleting(false);
    }
  }

  return (
    <div className="max-w-3xl">
      <Link href="/admin/lots" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6">
        <ArrowLeft className="h-4 w-4" />
        Back to Lots
      </Link>

      <div className="flex items-center justify-between mb-8">
        <h1 className="font-display text-display-sm">Edit Lot</h1>
        <Badge className={statusColors[status]}>{status.replace('_', ' ')}</Badge>
      </div>

      {transitions.length > 0 && (
        <Card className="mb-6">
          <CardHeader><CardTitle className="text-sm">Change Status</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {transitions.map((s) => (
              <Button key={s} variant="outline" size="sm" onClick={() => updateStatus(s)}>
                {s.replace(/_/g, ' ')}
              </Button>
            ))}
          </CardContent>
        </Card>
      )}

      <LotForm
        initialData={formData}
        initialImages={images}
        lotId={lotId}
        onSubmit={handleSubmit}
        isLoading={isLoading}
        submitLabel="Update Lot"
        cancelHref="/admin/lots"
      />

      {status !== 'in_auction' && status !== 'sold' && (
        <div className="mt-8 pt-8 border-t">
          <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
            <Trash2 className="h-4 w-4 mr-2" />
            {deleting ? 'Deleting...' : 'Delete Lot'}
          </Button>
        </div>
      )}
    </div>
  );
}
