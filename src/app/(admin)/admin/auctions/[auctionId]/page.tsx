'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { AuctionForm, type AuctionFormData } from '@/components/admin/AuctionForm';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Trash2, Plus, X, Download } from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';

const statusColors: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-800',
  scheduled: 'bg-blue-100 text-blue-800',
  preview: 'bg-indigo-100 text-indigo-800',
  open: 'bg-green-100 text-green-800',
  live: 'bg-red-100 text-red-800',
  closing: 'bg-orange-100 text-orange-800',
  closed: 'bg-gray-100 text-gray-600',
  completed: 'bg-emerald-100 text-emerald-800',
  cancelled: 'bg-red-100 text-red-600',
};

const statusTransitions: Record<string, string[]> = {
  draft: ['scheduled'],
  scheduled: ['preview', 'draft'],
  preview: ['open', 'scheduled'],
  open: ['closing', 'closed'],
  live: ['closing', 'closed'],
  closing: ['closed'],
  closed: ['completed'],
  completed: [],
  cancelled: [],
};

function formatDate(d: string | null) {
  if (!d) return '';
  const date = new Date(d);
  return date.toISOString().slice(0, 16);
}

function formatPrice(cents: number | null) {
  if (!cents) return '-';
  return `$${(cents / 100).toLocaleString()}`;
}

interface AssignedLot {
  id: string;
  title: string;
  lotNumber: number;
  status: string;
  estimateLow: number | null;
  estimateHigh: number | null;
  primaryImageUrl: string | null;
}

interface AvailableLot {
  id: string;
  title: string;
  artist: string | null;
  status: string;
  estimateLow: number | null;
  primaryImageUrl: string | null;
}

export default function EditAuctionPage() {
  const router = useRouter();
  const { auctionId } = useParams<{ auctionId: string }>();
  const [auction, setAuction] = useState<Record<string, unknown> | null>(null);
  const [assignedLots, setAssignedLots] = useState<AssignedLot[]>([]);
  const [availableLots, setAvailableLots] = useState<AvailableLot[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [nextLotNumber, setNextLotNumber] = useState(1);

  useEffect(() => {
    fetch(`/api/auctions/${auctionId}`)
      .then((r) => r.json())
      .then((d) => setAuction(d.data));
    loadAssignedLots();
    loadAvailableLots();
  }, [auctionId]);

  function loadAssignedLots() {
    fetch(`/api/auctions/${auctionId}/lots`)
      .then((r) => r.json())
      .then((d) => {
        const items = d.data || [];
        setAssignedLots(items);
        const maxNum = items.reduce((max: number, l: AssignedLot) => Math.max(max, l.lotNumber || 0), 0);
        setNextLotNumber(maxNum + 1);
      });
  }

  function loadAvailableLots() {
    fetch('/api/lots?status=approved&limit=100')
      .then((r) => r.json())
      .then((d) => setAvailableLots(d.data || []));
  }

  if (!auction) {
    return <div className="text-muted-foreground">Loading...</div>;
  }

  const formData: AuctionFormData = {
    title: (auction.title as string) || '',
    subtitle: (auction.subtitle as string) || '',
    description: (auction.description as string) || '',
    slug: (auction.slug as string) || '',
    liveauctioneersUrl: (auction.liveauctioneersUrl as string) || '',
    type: (auction.type as 'timed' | 'live') || 'timed',
    previewStartsAt: formatDate(auction.previewStartsAt as string | null),
    biddingStartsAt: formatDate(auction.biddingStartsAt as string | null),
    biddingEndsAt: formatDate(auction.biddingEndsAt as string | null),
    buyerPremiumPercent: (auction.buyerPremiumPercent as number) ?? 25,
    antiSnipeEnabled: (auction.antiSnipeEnabled as boolean) ?? true,
    antiSnipeMinutes: (auction.antiSnipeMinutes as number) ?? 2,
    antiSnipeWindowMinutes: (auction.antiSnipeWindowMinutes as number) ?? 5,
  };

  const status = (auction.status as string) || 'draft';
  const transitions = statusTransitions[status] || [];

  async function updateStatus(newStatus: string) {
    const res = await fetch(`/api/auctions/${auctionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
    if (res.ok) {
      setAuction((prev) => prev ? { ...prev, status: newStatus } : prev);
      toast.success(`Status updated to ${newStatus}`);
    } else {
      toast.error('Failed to update status');
    }
  }

  async function handleSubmit(data: Record<string, unknown>) {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/auctions/${auctionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error);
      toast.success('Auction updated');
      router.push('/admin/auctions');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleDelete() {
    if (!confirm('Delete this auction? This cannot be undone.')) return;
    setDeleting(true);
    const res = await fetch(`/api/auctions/${auctionId}`, { method: 'DELETE' });
    if (res.ok) {
      toast.success('Auction deleted');
      router.push('/admin/auctions');
    } else {
      const data = await res.json();
      toast.error(data.error || 'Failed to delete');
      setDeleting(false);
    }
  }

  async function assignLot(lotId: string) {
    const res = await fetch(`/api/auctions/${auctionId}/lots`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lotId, lotNumber: nextLotNumber }),
    });
    if (res.ok) {
      toast.success('Lot assigned');
      loadAssignedLots();
      loadAvailableLots();
    } else {
      const data = await res.json();
      toast.error(data.error || 'Failed to assign lot');
    }
  }

  async function removeLot(lotId: string) {
    const res = await fetch(`/api/auctions/${auctionId}/lots`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lotId }),
    });
    if (res.ok) {
      toast.success('Lot removed');
      loadAssignedLots();
      loadAvailableLots();
    } else {
      toast.error('Failed to remove lot');
    }
  }

  async function exportForLiveAuctioneers() {
    try {
      const res = await fetch(`/api/auctions/${auctionId}/export-csv`);
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || 'Export failed');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = res.headers.get('Content-Disposition')?.match(/filename="(.+)"/)?.[1] || 'export.csv';
      a.click();
      URL.revokeObjectURL(url);
      toast.success('CSV exported for LiveAuctioneers');
    } catch {
      toast.error('Export failed');
    }
  }

  // Filter out lots already assigned
  const assignedIds = new Set(assignedLots.map((l) => l.id));
  const unassignedLots = availableLots.filter((l) => !assignedIds.has(l.id));

  return (
    <div className="max-w-4xl">
      <Link href="/admin/auctions" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6">
        <ArrowLeft className="h-4 w-4" />
        Back to Auctions
      </Link>

      <div className="flex items-center justify-between mb-8">
        <h1 className="font-display text-display-sm">Edit Auction</h1>
        <Badge className={statusColors[status]}>{status}</Badge>
      </div>

      {transitions.length > 0 && (
        <Card className="mb-6">
          <CardHeader><CardTitle className="text-sm">Change Status</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {transitions.map((s) => (
              <Button key={s} variant="outline" size="sm" onClick={() => updateStatus(s)}>
                {s}
              </Button>
            ))}
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="details" className="mb-8">
        <TabsList>
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="lots">Lots ({assignedLots.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="details" className="mt-6">
          <AuctionForm
            initialData={formData}
            onSubmit={handleSubmit}
            isLoading={isLoading}
            submitLabel="Update Auction"
            cancelHref="/admin/auctions"
          />
        </TabsContent>

        <TabsContent value="lots" className="mt-6 space-y-6">
          {assignedLots.length > 0 && (
            <div className="flex justify-end">
              <Button variant="outline" size="sm" onClick={exportForLiveAuctioneers} className="gap-2">
                <Download className="h-4 w-4" />
                Export for LiveAuctioneers
              </Button>
            </div>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Assigned Lots ({assignedLots.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {assignedLots.length === 0 ? (
                <p className="text-sm text-muted-foreground">No lots assigned yet. Add lots from the available list below.</p>
              ) : (
                <div className="space-y-2">
                  {assignedLots.map((lot) => (
                    <div key={lot.id} className="flex items-center gap-3 p-3 rounded-md border">
                      {lot.primaryImageUrl ? (
                        <img src={lot.primaryImageUrl} alt={lot.title} className="w-12 h-12 object-cover rounded" />
                      ) : (
                        <div className="w-12 h-12 bg-muted rounded flex items-center justify-center text-xs text-muted-foreground">No img</div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">Lot {lot.lotNumber}: {lot.title}</div>
                        <div className="text-xs text-muted-foreground">
                          {lot.estimateLow ? `${formatPrice(lot.estimateLow)} - ${formatPrice(lot.estimateHigh)}` : 'No estimate'}
                        </div>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => removeLot(lot.id)} className="text-red-600 hover:text-red-700">
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Available Lots</CardTitle>
            </CardHeader>
            <CardContent>
              {unassignedLots.length === 0 ? (
                <p className="text-sm text-muted-foreground">No approved lots available. Create and approve lots first.</p>
              ) : (
                <div className="space-y-2">
                  {unassignedLots.map((lot) => (
                    <div key={lot.id} className="flex items-center gap-3 p-3 rounded-md border">
                      {lot.primaryImageUrl ? (
                        <img src={lot.primaryImageUrl} alt={lot.title} className="w-12 h-12 object-cover rounded" />
                      ) : (
                        <div className="w-12 h-12 bg-muted rounded flex items-center justify-center text-xs text-muted-foreground">No img</div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">{lot.title}</div>
                        <div className="text-xs text-muted-foreground">
                          {lot.artist || ''} {lot.estimateLow ? `- Est. ${formatPrice(lot.estimateLow)}` : ''}
                        </div>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => assignLot(lot.id)}>
                        <Plus className="h-4 w-4 mr-1" /> Add
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {!['open', 'live', 'closing'].includes(status) && (
        <div className="pt-8 border-t">
          <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
            <Trash2 className="h-4 w-4 mr-2" />
            {deleting ? 'Deleting...' : 'Delete Auction'}
          </Button>
        </div>
      )}
    </div>
  );
}
