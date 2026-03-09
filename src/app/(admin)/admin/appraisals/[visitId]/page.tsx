'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  ArrowLeft,
  Loader2,
  Send,
  Copy,
  CheckCircle,
  AlertCircle,
  Clock,
  RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatCurrency } from '@/types';
import { ItemEditSheet } from '@/components/admin/ItemEditSheet';
import { BUSINESS } from '@/lib/config';

interface EstateVisit {
  id: string;
  clientName: string;
  clientEmail: string | null;
  clientPhone: string | null;
  clientAddress: string | null;
  clientCity: string | null;
  clientState: string | null;
  visitDate: string | null;
  notes: string | null;
  status: string;
  reportToken: string;
  itemCount: number;
  processedCount: number;
  totalEstimateLow: number;
  totalEstimateHigh: number;
  sentAt: string | null;
}

interface EstateVisitItem {
  id: string;
  imageUrl: string;
  sortOrder: number;
  status: string;
  errorMessage: string | null;
  title: string | null;
  description: string | null;
  artist: string | null;
  period: string | null;
  medium: string | null;
  dimensions: string | null;
  condition: string | null;
  conditionNotes: string | null;
  suggestedCategory: string | null;
  estimateLow: number | null;
  estimateHigh: number | null;
  confidence: string | null;
  reasoning: string | null;
  marketTrend: string | null;
}

const statusColors: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700',
  uploading: 'bg-blue-100 text-blue-700',
  processing: 'bg-yellow-100 text-yellow-700',
  review: 'bg-orange-100 text-orange-700',
  sent: 'bg-green-100 text-green-700',
  archived: 'bg-gray-100 text-gray-500',
};

const itemStatusIcons: Record<string, React.ReactNode> = {
  pending: <Clock className="h-4 w-4 text-gray-400" />,
  processing: <Loader2 className="h-4 w-4 animate-spin text-yellow-500" />,
  completed: <CheckCircle className="h-4 w-4 text-green-500" />,
  error: <AlertCircle className="h-4 w-4 text-red-500" />,
};

export default function AppraisalDetailPage() {
  const { visitId } = useParams<{ visitId: string }>();
  const router = useRouter();
  const [visit, setVisit] = useState<EstateVisit | null>(null);
  const [items, setItems] = useState<EstateVisitItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [editingItem, setEditingItem] = useState<EstateVisitItem | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/appraisals/${visitId}/items`);
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setVisit(data.visit);
      setItems(data.data);
    } catch {
      toast.error('Failed to load appraisal');
    } finally {
      setLoading(false);
    }
  }, [visitId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Poll during processing
  useEffect(() => {
    if (visit?.status !== 'processing') return;
    const interval = setInterval(fetchData, 4000);
    return () => clearInterval(interval);
  }, [visit?.status, fetchData]);

  // Auto-trigger next batch during processing
  useEffect(() => {
    if (visit?.status !== 'processing') return;
    if (visit.processedCount >= visit.itemCount) return;

    const triggerBatch = async () => {
      try {
        await fetch(`/api/admin/appraisals/${visitId}/process`, { method: 'POST' });
      } catch {
        // Silently retry on next poll
      }
    };
    triggerBatch();
  }, [visit?.processedCount, visit?.status, visit?.itemCount, visitId]);

  const handleSendReport = async () => {
    if (!visit?.clientEmail) {
      toast.error('Client email is required to send the report');
      return;
    }
    setSending(true);
    try {
      const res = await fetch(`/api/admin/appraisals/${visitId}/send`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed to send');
      toast.success('Report sent to ' + visit.clientEmail);
      fetchData();
    } catch {
      toast.error('Failed to send report');
    } finally {
      setSending(false);
    }
  };

  const handleCopyLink = () => {
    if (!visit) return;
    navigator.clipboard.writeText(`${BUSINESS.url}/appraisal-report/${visit.reportToken}`);
    toast.success('Report link copied');
  };

  const handleItemUpdate = async (itemId: string, updates: Partial<EstateVisitItem>) => {
    try {
      const res = await fetch(`/api/admin/appraisals/${visitId}/items`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId, ...updates }),
      });
      if (!res.ok) throw new Error('Failed to update');
      toast.success('Item updated');
      setEditingItem(null);
      fetchData();
    } catch {
      toast.error('Failed to update item');
    }
  };

  const handleItemDelete = async (itemId: string) => {
    try {
      const res = await fetch(`/api/admin/appraisals/${visitId}/items`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId }),
      });
      if (!res.ok) throw new Error('Failed to delete');
      toast.success('Item removed');
      setEditingItem(null);
      fetchData();
    } catch {
      toast.error('Failed to delete item');
    }
  };

  const handleReprocess = async (itemId: string) => {
    try {
      await fetch(`/api/admin/appraisals/${visitId}/items`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId, status: 'pending', errorMessage: null }),
      });
      await fetch(`/api/admin/appraisals/${visitId}/process`, { method: 'POST' });
      toast.success('Re-analyzing item...');
      setEditingItem(null);
      fetchData();
    } catch {
      toast.error('Failed to reprocess');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-champagne" />
      </div>
    );
  }

  if (!visit) {
    return <p className="text-center py-20 text-muted-foreground">Appraisal not found</p>;
  }

  const progress = visit.itemCount > 0 ? (visit.processedCount / visit.itemCount) * 100 : 0;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Link href="/admin/appraisals">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="font-display text-display-sm">{visit.clientName}</h1>
            <Badge variant="outline" className={statusColors[visit.status] || ''}>
              {visit.status}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            {[visit.clientCity, visit.clientState].filter(Boolean).join(', ')}
            {visit.visitDate && ` · ${new Date(visit.visitDate).toLocaleDateString()}`}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleCopyLink}>
            <Copy className="h-4 w-4 mr-1" />
            Copy Link
          </Button>
          {(visit.status === 'review' || visit.status === 'sent') && (
            <Button
              size="sm"
              className="bg-champagne text-charcoal hover:bg-champagne/90"
              onClick={handleSendReport}
              disabled={sending || !visit.clientEmail}
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Send className="h-4 w-4 mr-1" />}
              {visit.status === 'sent' ? 'Resend Report' : 'Send to Client'}
            </Button>
          )}
        </div>
      </div>

      {/* Progress Bar (during processing) */}
      {visit.status === 'processing' && (
        <Card className="mb-6">
          <CardContent className="py-5">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-champagne" />
                <span className="text-sm font-medium">AI Analysis in Progress</span>
              </div>
              <span className="text-sm text-muted-foreground">
                {visit.processedCount} of {visit.itemCount} items
              </span>
            </div>
            <div className="w-full bg-muted rounded-full h-2.5">
              <div
                className="bg-champagne h-2.5 rounded-full transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Sent confirmation */}
      {visit.status === 'sent' && visit.sentAt && (
        <Card className="mb-6 border-green-200 bg-green-50">
          <CardContent className="py-4 flex items-center gap-3">
            <CheckCircle className="h-5 w-5 text-green-600" />
            <span className="text-sm text-green-800">
              Report sent to {visit.clientEmail} on{' '}
              {new Date(visit.sentAt).toLocaleDateString()}
            </span>
          </CardContent>
        </Card>
      )}

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-2xl font-display">{visit.itemCount}</p>
            <p className="text-xs text-muted-foreground">Total Items</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-2xl font-display">{visit.processedCount}</p>
            <p className="text-xs text-muted-foreground">Analyzed</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-lg font-display">
              {visit.totalEstimateHigh > 0
                ? `${formatCurrency(visit.totalEstimateLow)} – ${formatCurrency(visit.totalEstimateHigh)}`
                : '—'}
            </p>
            <p className="text-xs text-muted-foreground">Total Estimate</p>
          </CardContent>
        </Card>
      </div>

      {/* Items Grid */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Items ({items.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {items.map((item) => (
              <button
                key={item.id}
                onClick={() => setEditingItem(item)}
                className="text-left border rounded-xl overflow-hidden hover:shadow-md transition-shadow group"
              >
                <div className="aspect-square relative">
                  <img
                    src={item.imageUrl}
                    alt={item.title || 'Item'}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute top-2 right-2">
                    {itemStatusIcons[item.status]}
                  </div>
                </div>
                <div className="p-3">
                  <p className="text-sm font-medium line-clamp-1">
                    {item.title || 'Pending analysis...'}
                  </p>
                  {item.condition && (
                    <p className="text-[11px] text-muted-foreground mt-0.5 capitalize">
                      {item.condition.replace('_', ' ')}
                    </p>
                  )}
                  {item.estimateLow && item.estimateHigh ? (
                    <p className="text-xs font-medium text-champagne mt-1">
                      {formatCurrency(item.estimateLow)} – {formatCurrency(item.estimateHigh)}
                    </p>
                  ) : item.status === 'error' ? (
                    <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      Error
                    </p>
                  ) : null}
                </div>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Edit Sheet */}
      {editingItem && (
        <ItemEditSheet
          item={editingItem}
          onClose={() => setEditingItem(null)}
          onSave={(updates) => handleItemUpdate(editingItem.id, updates)}
          onDelete={() => handleItemDelete(editingItem.id)}
          onReprocess={() => handleReprocess(editingItem.id)}
        />
      )}
    </div>
  );
}
