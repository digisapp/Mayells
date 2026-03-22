'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/types';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Brain,
  Send,
  FileSignature,
  Package,
  Check,
  X,
  ChevronDown,
  ChevronUp,
  Image,
  Loader2,
  Copy,
  ExternalLink,
  DollarSign,
  BarChart3,
  CheckCircle,
  XCircle,
  Edit3,
} from 'lucide-react';

// ── Types ──

interface UploadLink {
  id: string;
  token: string;
  status: string;
  maxItems: number | null;
  expiresAt: string | null;
  itemCount: number;
  createdAt: string;
  items?: UploadItem[];
}

interface Prospect {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  source: string;
  status: string;
  totalItems: number;
  reviewedItems: number;
  acceptedItems: number;
  totalEstimateLow: number;
  totalEstimateHigh: number;
  agreedCommissionPercent: number | null;
  notes: string | null;
  itemSummary: string | null;
  uploadLinks: UploadLink[];
  createdAt: string;
  updatedAt: string;
}

interface UploadItem {
  id: string;
  uploadLinkId: string;
  prospectId: string;
  images: string[] | null;
  sellerNotes: string | null;
  sellerTitle: string | null;
  sortOrder: number;
  groupLabel: string | null;
  aiTitle: string | null;
  aiSubtitle: string | null;
  aiDescription: string | null;
  aiArtist: string | null;
  aiMaker: string | null;
  aiPeriod: string | null;
  aiCirca: string | null;
  aiOrigin: string | null;
  aiMedium: string | null;
  aiDimensions: string | null;
  aiCondition: string | null;
  aiConditionNotes: string | null;
  aiCategory: string | null;
  aiTags: string[] | null;
  aiEstimateLow: number | null;
  aiEstimateHigh: number | null;
  aiConfidence: string | null;
  aiReasoning: string | null;
  aiMarketTrend: string | null;
  aiRecommendedReserve: number | null;
  aiSuggestedStartingBid: number | null;
  aiProcessedAt: string | null;
  status: string;
  adminNotes: string | null;
  reviewedAt: string | null;
  finalTitle: string | null;
  finalDescription: string | null;
  finalEstimateLow: number | null;
  finalEstimateHigh: number | null;
  finalReserve: number | null;
  finalCategory: string | null;
  lotId: string | null;
  auctionId: string | null;
  createdAt: string;
  updatedAt: string;
}

// ── Status Colors ──

const itemStatusColors: Record<string, string> = {
  uploaded: 'bg-gray-100 text-gray-800',
  processing: 'bg-yellow-100 text-yellow-800',
  cataloged: 'bg-blue-100 text-blue-800',
  accepted: 'bg-green-100 text-green-800',
  declined: 'bg-red-100 text-red-800',
  lot_created: 'bg-emerald-100 text-emerald-800',
};

const prospectStatusColors: Record<string, string> = {
  new: 'bg-gray-100 text-gray-800',
  contacted: 'bg-blue-100 text-blue-800',
  upload_sent: 'bg-indigo-100 text-indigo-800',
  items_received: 'bg-purple-100 text-purple-800',
  under_review: 'bg-yellow-100 text-yellow-800',
  agreement_sent: 'bg-orange-100 text-orange-800',
  agreement_signed: 'bg-green-100 text-green-800',
  accepted: 'bg-green-100 text-green-800',
  declined: 'bg-red-100 text-red-800',
  archived: 'bg-gray-100 text-gray-500',
};

// ── Confidence Badge ──

function confidenceBadge(confidence: string | null) {
  if (!confidence) return null;
  const val = parseFloat(confidence);
  if (isNaN(val)) return <Badge variant="secondary">{confidence}</Badge>;
  const color =
    val >= 0.8
      ? 'bg-green-100 text-green-800'
      : val >= 0.5
        ? 'bg-yellow-100 text-yellow-800'
        : 'bg-red-100 text-red-800';
  return (
    <Badge className={color} variant="secondary">
      {(val * 100).toFixed(0)}% confidence
    </Badge>
  );
}

// ── Item Overrides ──

interface ItemOverrides {
  finalTitle: string;
  finalEstimateLow: string;
  finalEstimateHigh: string;
  finalReserve: string;
  finalCategory: string;
}

// ── Main Component ──

export default function AdminProspectDetailPage() {
  const { prospectId } = useParams<{ prospectId: string }>();
  const router = useRouter();

  const [prospect, setProspect] = useState<Prospect | null>(null);
  const [items, setItems] = useState<UploadItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [itemsLoading, setItemsLoading] = useState(true);

  // Action loading states
  const [processingAI, setProcessingAI] = useState(false);
  const [sendingUploadLink, setSendingUploadLink] = useState(false);
  const [sendingAgreement, setSendingAgreement] = useState(false);
  const [creatingLots, setCreatingLots] = useState(false);
  const [updatingItems, setUpdatingItems] = useState<Set<string>>(new Set());

  // UI state
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [editingItems, setEditingItems] = useState<Set<string>>(new Set());
  const [overrides, setOverrides] = useState<Record<string, ItemOverrides>>({});
  const [auctionId, setAuctionId] = useState('');
  const [commissionPercent, setCommissionPercent] = useState('35');

  // ── Data Fetching ──

  const fetchProspect = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/prospects/${prospectId}`);
      const json = await res.json();
      if (res.ok && json.data) {
        setProspect(json.data);
      } else {
        toast.error(json.error || 'Failed to load prospect');
      }
    } catch {
      toast.error('Network error loading prospect');
    } finally {
      setLoading(false);
    }
  }, [prospectId]);

  const fetchItems = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/prospects/${prospectId}/items`);
      const json = await res.json();
      if (res.ok && json.items) {
        setItems(json.items);
      } else {
        toast.error(json.error || 'Failed to load items');
      }
    } catch {
      toast.error('Network error loading items');
    } finally {
      setItemsLoading(false);
    }
  }, [prospectId]);

  useEffect(() => {
    fetchProspect();
    fetchItems();
  }, [fetchProspect, fetchItems]);

  // ── Actions ──

  async function handleRunAI() {
    setProcessingAI(true);
    try {
      const res = await fetch(`/api/admin/prospects/${prospectId}/process`, {
        method: 'POST',
      });
      const json = await res.json();
      if (res.ok) {
        toast.success(
          `AI processing complete: ${json.processed} processed, ${json.failed} failed out of ${json.total}`
        );
        fetchItems();
        fetchProspect();
      } else {
        toast.error(json.error || 'AI processing failed');
      }
    } catch {
      toast.error('Network error during AI processing');
    } finally {
      setProcessingAI(false);
    }
  }

  async function handleSendUploadLink() {
    setSendingUploadLink(true);
    try {
      const res = await fetch(`/api/admin/prospects/${prospectId}/upload-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expiresInDays: 14 }),
      });
      const json = await res.json();
      if (res.ok && json.data) {
        const url = json.data.url;
        await navigator.clipboard.writeText(url);
        toast.success('Upload link created and copied to clipboard');
        fetchProspect();
      } else {
        toast.error(json.error || 'Failed to create upload link');
      }
    } catch {
      toast.error('Network error');
    } finally {
      setSendingUploadLink(false);
    }
  }

  async function handleSendAgreement() {
    const commission = parseInt(commissionPercent, 10);
    if (isNaN(commission) || commission < 1 || commission > 100) {
      toast.error('Commission must be between 1 and 100');
      return;
    }
    setSendingAgreement(true);
    try {
      const res = await fetch(`/api/admin/prospects/${prospectId}/agreement`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commissionPercent: commission }),
      });
      const json = await res.json();
      if (res.ok) {
        toast.success('Agreement sent successfully');
        fetchProspect();
      } else {
        toast.error(json.error || 'Failed to send agreement');
      }
    } catch {
      toast.error('Network error');
    } finally {
      setSendingAgreement(false);
    }
  }

  async function handleCreateLots() {
    setCreatingLots(true);
    try {
      const acceptedItemIds = items
        .filter((i) => i.status === 'accepted')
        .map((i) => i.id);

      const res = await fetch(`/api/admin/prospects/${prospectId}/create-lots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          auctionId: auctionId.trim() || undefined,
          itemIds: acceptedItemIds.length > 0 ? acceptedItemIds : undefined,
        }),
      });
      const json = await res.json();
      if (res.ok) {
        toast.success(`${json.lotsCreated} lot(s) created successfully`);
        fetchItems();
        fetchProspect();
      } else {
        toast.error(json.error || 'Failed to create lots');
      }
    } catch {
      toast.error('Network error');
    } finally {
      setCreatingLots(false);
    }
  }

  async function handleItemAction(
    itemId: string,
    action: 'accept' | 'decline',
    itemOverrides?: ItemOverrides
  ) {
    setUpdatingItems((prev) => new Set(prev).add(itemId));
    try {
      const payload: Record<string, unknown> = { id: itemId, action };
      if (itemOverrides) {
        if (itemOverrides.finalTitle.trim()) payload.finalTitle = itemOverrides.finalTitle.trim();
        const parsedLow = parseInt(itemOverrides.finalEstimateLow, 10);
        if (!isNaN(parsedLow)) payload.finalEstimateLow = parsedLow;
        const parsedHigh = parseInt(itemOverrides.finalEstimateHigh, 10);
        if (!isNaN(parsedHigh)) payload.finalEstimateHigh = parsedHigh;
        const parsedReserve = parseInt(itemOverrides.finalReserve, 10);
        if (!isNaN(parsedReserve)) payload.finalReserve = parsedReserve;
        if (itemOverrides.finalCategory.trim())
          payload.finalCategory = itemOverrides.finalCategory.trim();
      }

      const res = await fetch(`/api/admin/prospects/${prospectId}/items`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: [payload] }),
      });
      const json = await res.json();
      if (res.ok) {
        toast.success(`Item ${action === 'accept' ? 'accepted' : 'declined'}`);
        // Update local state
        setItems((prev) =>
          prev.map((i) =>
            i.id === itemId
              ? {
                  ...i,
                  status: action === 'accept' ? 'accepted' : 'declined',
                  reviewedAt: new Date().toISOString(),
                  ...(itemOverrides?.finalTitle.trim() && {
                    finalTitle: itemOverrides.finalTitle.trim(),
                  }),
                  ...(itemOverrides?.finalEstimateLow.trim() && {
                    finalEstimateLow: parseInt(itemOverrides.finalEstimateLow, 10),
                  }),
                  ...(itemOverrides?.finalEstimateHigh.trim() && {
                    finalEstimateHigh: parseInt(itemOverrides.finalEstimateHigh, 10),
                  }),
                  ...(itemOverrides?.finalReserve.trim() && {
                    finalReserve: parseInt(itemOverrides.finalReserve, 10),
                  }),
                  ...(itemOverrides?.finalCategory.trim() && {
                    finalCategory: itemOverrides.finalCategory.trim(),
                  }),
                }
              : i
          )
        );
        // Update prospect stats from response
        if (json.acceptedItems !== undefined) {
          setProspect((prev) =>
            prev
              ? {
                  ...prev,
                  acceptedItems: json.acceptedItems,
                  reviewedItems: json.reviewedItems,
                  totalEstimateLow: json.totalEstimateLow,
                  totalEstimateHigh: json.totalEstimateHigh,
                }
              : prev
          );
        }
        // Close editing panel
        setEditingItems((prev) => {
          const next = new Set(prev);
          next.delete(itemId);
          return next;
        });
      } else {
        toast.error(json.error || 'Failed to update item');
      }
    } catch {
      toast.error('Network error');
    } finally {
      setUpdatingItems((prev) => {
        const next = new Set(prev);
        next.delete(itemId);
        return next;
      });
    }
  }

  // ── Bulk Actions ──

  async function handleBulkAcceptAll() {
    const catalogedItems = items.filter((i) => i.status === 'cataloged');
    if (catalogedItems.length === 0) {
      toast.error('No cataloged items to accept');
      return;
    }
    const payload = catalogedItems.map((i) => ({ id: i.id, action: 'accept' as const }));
    setUpdatingItems(new Set(catalogedItems.map((i) => i.id)));
    try {
      const res = await fetch(`/api/admin/prospects/${prospectId}/items`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: payload }),
      });
      const json = await res.json();
      if (res.ok) {
        toast.success(`${catalogedItems.length} item(s) accepted`);
        fetchItems();
        if (json.acceptedItems !== undefined) {
          setProspect((prev) =>
            prev
              ? {
                  ...prev,
                  acceptedItems: json.acceptedItems,
                  reviewedItems: json.reviewedItems,
                  totalEstimateLow: json.totalEstimateLow,
                  totalEstimateHigh: json.totalEstimateHigh,
                }
              : prev
          );
        }
      } else {
        toast.error(json.error || 'Bulk accept failed');
      }
    } catch {
      toast.error('Network error');
    } finally {
      setUpdatingItems(new Set());
    }
  }

  // ── Helpers ──

  function toggleExpand(itemId: string) {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }

  function toggleEdit(itemId: string, item: UploadItem) {
    setEditingItems((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
        // Initialize overrides from existing data
        if (!overrides[itemId]) {
          setOverrides((o) => ({
            ...o,
            [itemId]: {
              finalTitle: item.finalTitle || item.aiTitle || '',
              finalEstimateLow: String(item.finalEstimateLow ?? item.aiEstimateLow ?? ''),
              finalEstimateHigh: String(item.finalEstimateHigh ?? item.aiEstimateHigh ?? ''),
              finalReserve: String(item.finalReserve ?? item.aiRecommendedReserve ?? ''),
              finalCategory: item.finalCategory || item.aiCategory || '',
            },
          }));
        }
      }
      return next;
    });
  }

  function updateOverride(itemId: string, field: keyof ItemOverrides, value: string) {
    setOverrides((prev) => ({
      ...prev,
      [itemId]: { ...prev[itemId], [field]: value },
    }));
  }

  // ── Derived Values ──

  const totalItems = items.length;
  const processedItems = items.filter(
    (i) => i.status !== 'uploaded' && i.status !== 'processing'
  ).length;
  const acceptedCount = items.filter((i) => i.status === 'accepted').length;
  const declinedCount = items.filter((i) => i.status === 'declined').length;
  const uploadedCount = items.filter((i) => i.status === 'uploaded').length;
  const hasAcceptedItems = acceptedCount > 0;

  const estLow = items.reduce(
    (sum, i) => sum + (i.finalEstimateLow ?? i.aiEstimateLow ?? 0),
    0
  );
  const estHigh = items.reduce(
    (sum, i) => sum + (i.finalEstimateHigh ?? i.aiEstimateHigh ?? 0),
    0
  );

  // ── Loading Skeleton ──

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        <div className="h-24 bg-muted animate-pulse rounded-lg" />
        <div className="grid grid-cols-5 gap-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-24 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-64 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (!prospect) {
    return (
      <div>
        <Link
          href="/admin/prospects"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to Prospects
        </Link>
        <p className="text-muted-foreground mt-8 text-center">Prospect not found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── 1. Prospect Header ── */}
      <div>
        <Link
          href="/admin/prospects"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to Prospects
        </Link>

        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="font-display text-display-sm">{prospect.fullName}</h1>
              <Badge
                className={prospectStatusColors[prospect.status] ?? 'bg-gray-100 text-gray-800'}
                variant="secondary"
              >
                {prospect.status.replace(/_/g, ' ')}
              </Badge>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              {prospect.email && <span>{prospect.email}</span>}
              {prospect.phone && <span>{prospect.phone}</span>}
              {prospect.company && <span>{prospect.company}</span>}
              <span className="capitalize">Source: {prospect.source.replace(/_/g, ' ')}</span>
            </div>
            {prospect.notes && (
              <p className="text-sm text-muted-foreground mt-2 max-w-2xl">{prospect.notes}</p>
            )}
            {prospect.itemSummary && (
              <p className="text-sm text-muted-foreground mt-1 max-w-2xl italic">
                {prospect.itemSummary}
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleSendUploadLink}
              disabled={sendingUploadLink}
            >
              {sendingUploadLink ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Send className="h-4 w-4 mr-2" />
              )}
              Send Upload Link
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleRunAI}
              disabled={processingAI || uploadedCount === 0}
            >
              {processingAI ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Brain className="h-4 w-4 mr-2" />
              )}
              {processingAI ? 'Processing...' : 'Run AI Processing'}
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleSendAgreement}
              disabled={sendingAgreement || !hasAcceptedItems || !prospect.email}
            >
              {sendingAgreement ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <FileSignature className="h-4 w-4 mr-2" />
              )}
              Send Agreement
            </Button>

            <Button
              size="sm"
              onClick={handleCreateLots}
              disabled={creatingLots || !hasAcceptedItems}
              className="bg-champagne text-charcoal hover:bg-champagne/90"
            >
              {creatingLots ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Package className="h-4 w-4 mr-2" />
              )}
              Create Lots
            </Button>
          </div>
        </div>

        {/* Upload Links */}
        {prospect.uploadLinks && prospect.uploadLinks.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {prospect.uploadLinks.map((link) => {
              const url = `${typeof window !== 'undefined' ? window.location.origin : ''}/upload/${link.token}`;
              return (
                <div
                  key={link.id}
                  className="flex items-center gap-2 text-xs border rounded-md px-3 py-1.5 bg-muted/50"
                >
                  <span className="text-muted-foreground">
                    Upload Link ({link.itemCount} items)
                  </span>
                  <Badge
                    variant="secondary"
                    className={cn(
                      link.status === 'active' && 'bg-green-100 text-green-800',
                      link.status === 'expired' && 'bg-red-100 text-red-800',
                      link.status === 'completed' && 'bg-blue-100 text-blue-800'
                    )}
                  >
                    {link.status}
                  </Badge>
                  <button
                    className="text-muted-foreground hover:text-foreground"
                    onClick={() => {
                      navigator.clipboard.writeText(url);
                      toast.success('Link copied');
                    }}
                    title="Copy link"
                  >
                    <Copy className="h-3 w-3" />
                  </button>
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground hover:text-foreground"
                    title="Open link"
                  >
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── 2. Stats Cards Row ── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
              <Image className="h-4 w-4" /> Total Items
            </div>
            <p className="text-2xl font-semibold">{totalItems}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
              <BarChart3 className="h-4 w-4" /> Processed
            </div>
            <p className="text-2xl font-semibold">
              {processedItems}
              <span className="text-sm text-muted-foreground font-normal ml-1">
                / {totalItems}
              </span>
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
              <CheckCircle className="h-4 w-4 text-green-600" /> Accepted
            </div>
            <p className="text-2xl font-semibold text-green-700">{acceptedCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
              <XCircle className="h-4 w-4 text-red-600" /> Declined
            </div>
            <p className="text-2xl font-semibold text-red-700">{declinedCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
              <DollarSign className="h-4 w-4" /> Est. Value Range
            </div>
            <p className="text-lg font-semibold">
              {estLow > 0 || estHigh > 0
                ? `${formatCurrency(estLow)} - ${formatCurrency(estHigh)}`
                : '--'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ── 3. Items Grid ── */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-lg">Items</h2>
          <div className="flex gap-2">
            {items.some((i) => i.status === 'cataloged') && (
              <Button variant="outline" size="sm" onClick={handleBulkAcceptAll}>
                <Check className="h-4 w-4 mr-1" /> Accept All Cataloged
              </Button>
            )}
          </div>
        </div>

        {itemsLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-64 bg-muted animate-pulse rounded-lg" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              No items uploaded yet. Send an upload link to get started.
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {items.map((item) => {
              const isExpanded = expandedItems.has(item.id);
              const isEditing = editingItems.has(item.id);
              const isUpdating = updatingItems.has(item.id);
              const itemOv = overrides[item.id];
              const primaryImage = item.images?.[0];
              const title = item.finalTitle || item.aiTitle || item.sellerTitle || 'Untitled Item';
              const canReview =
                item.status === 'cataloged' ||
                item.status === 'uploaded';

              return (
                <Card key={item.id} className="overflow-hidden">
                  <div className="flex">
                    {/* Image */}
                    <div className="w-32 h-32 flex-shrink-0 bg-muted relative">
                      {primaryImage ? (
                        <img
                          src={primaryImage}
                          alt={title}
                          className="w-full h-full object-cover"
                          onError={(e) => { e.currentTarget.style.display = 'none'; }}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                          <Image className="h-8 w-8" />
                        </div>
                      )}
                      {item.images && item.images.length > 1 && (
                        <div className="absolute bottom-1 right-1 bg-black/60 text-white text-xs px-1.5 py-0.5 rounded">
                          +{item.images.length - 1}
                        </div>
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 p-3 min-w-0">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <h3 className="font-medium text-sm truncate">{title}</h3>
                        <Badge
                          className={cn(
                            'text-xs flex-shrink-0',
                            itemStatusColors[item.status] ?? 'bg-gray-100 text-gray-800'
                          )}
                          variant="secondary"
                        >
                          {item.status.replace(/_/g, ' ')}
                        </Badge>
                      </div>

                      {/* AI Estimate */}
                      {(item.aiEstimateLow || item.aiEstimateHigh) && (
                        <p className="text-sm text-muted-foreground">
                          Est: {formatCurrency(item.aiEstimateLow ?? 0)} -{' '}
                          {formatCurrency(item.aiEstimateHigh ?? 0)}
                        </p>
                      )}

                      {/* AI Category + Confidence */}
                      <div className="flex flex-wrap items-center gap-1.5 mt-1">
                        {item.aiCategory && (
                          <Badge variant="outline" className="text-xs capitalize">
                            {item.aiCategory}
                          </Badge>
                        )}
                        {confidenceBadge(item.aiConfidence)}
                      </div>

                      {/* Action Buttons */}
                      <div className="flex items-center gap-1.5 mt-2">
                        {canReview && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-xs border-green-300 text-green-700 hover:bg-green-50"
                              onClick={() =>
                                handleItemAction(
                                  item.id,
                                  'accept',
                                  isEditing ? itemOv : undefined
                                )
                              }
                              disabled={isUpdating}
                            >
                              {isUpdating ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Check className="h-3 w-3 mr-1" />
                              )}
                              Accept
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-xs border-red-300 text-red-700 hover:bg-red-50"
                              onClick={() => handleItemAction(item.id, 'decline')}
                              disabled={isUpdating}
                            >
                              {isUpdating ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <X className="h-3 w-3 mr-1" />
                              )}
                              Decline
                            </Button>
                          </>
                        )}
                        {item.status === 'cataloged' && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs"
                            onClick={() => toggleEdit(item.id, item)}
                          >
                            <Edit3 className="h-3 w-3 mr-1" />
                            {isEditing ? 'Cancel Edit' : 'Override'}
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs ml-auto"
                          onClick={() => toggleExpand(item.id)}
                        >
                          {isExpanded ? (
                            <ChevronUp className="h-3 w-3" />
                          ) : (
                            <ChevronDown className="h-3 w-3" />
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* Override Fields */}
                  {isEditing && itemOv && (
                    <div className="border-t bg-muted/30 p-3 space-y-2">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Override AI Suggestions
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-xs text-muted-foreground">Title</label>
                          <Input
                            className="h-8 text-sm"
                            value={itemOv.finalTitle}
                            onChange={(e) =>
                              updateOverride(item.id, 'finalTitle', e.target.value)
                            }
                            placeholder="Final title"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground">Category</label>
                          <Input
                            className="h-8 text-sm"
                            value={itemOv.finalCategory}
                            onChange={(e) =>
                              updateOverride(item.id, 'finalCategory', e.target.value)
                            }
                            placeholder="Category"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground">Estimate Low</label>
                          <Input
                            className="h-8 text-sm"
                            type="number"
                            value={itemOv.finalEstimateLow}
                            onChange={(e) =>
                              updateOverride(item.id, 'finalEstimateLow', e.target.value)
                            }
                            placeholder="Low estimate"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground">Estimate High</label>
                          <Input
                            className="h-8 text-sm"
                            type="number"
                            value={itemOv.finalEstimateHigh}
                            onChange={(e) =>
                              updateOverride(item.id, 'finalEstimateHigh', e.target.value)
                            }
                            placeholder="High estimate"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground">Reserve</label>
                          <Input
                            className="h-8 text-sm"
                            type="number"
                            value={itemOv.finalReserve}
                            onChange={(e) =>
                              updateOverride(item.id, 'finalReserve', e.target.value)
                            }
                            placeholder="Reserve price"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Expanded Detail */}
                  {isExpanded && (
                    <div className="border-t bg-muted/20 p-4 space-y-3">
                      {/* Additional Images */}
                      {item.images && item.images.length > 1 && (
                        <div>
                          <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
                            All Images ({item.images.length})
                          </p>
                          <div className="flex gap-2 overflow-x-auto pb-2">
                            {item.images.map((img, idx) => (
                              <img
                                key={idx}
                                src={img}
                                alt={`${title} image ${idx + 1}`}
                                className="w-20 h-20 object-cover rounded border flex-shrink-0"
                                onError={(e) => { e.currentTarget.style.display = 'none'; }}
                              />
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Seller Info */}
                      {(item.sellerTitle || item.sellerNotes) && (
                        <div>
                          <p className="text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wide">
                            Seller Info
                          </p>
                          {item.sellerTitle && (
                            <p className="text-sm">
                              <span className="text-muted-foreground">Title:</span>{' '}
                              {item.sellerTitle}
                            </p>
                          )}
                          {item.sellerNotes && (
                            <p className="text-sm">
                              <span className="text-muted-foreground">Notes:</span>{' '}
                              {item.sellerNotes}
                            </p>
                          )}
                        </div>
                      )}

                      {/* AI Catalog Data */}
                      {item.aiProcessedAt && (
                        <div>
                          <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
                            AI Catalog
                          </p>
                          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                            {item.aiTitle && (
                              <DetailRow label="Title" value={item.aiTitle} />
                            )}
                            {item.aiSubtitle && (
                              <DetailRow label="Subtitle" value={item.aiSubtitle} />
                            )}
                            {item.aiArtist && (
                              <DetailRow label="Artist" value={item.aiArtist} />
                            )}
                            {item.aiMaker && (
                              <DetailRow label="Maker" value={item.aiMaker} />
                            )}
                            {item.aiPeriod && (
                              <DetailRow label="Period" value={item.aiPeriod} />
                            )}
                            {item.aiCirca && (
                              <DetailRow label="Circa" value={item.aiCirca} />
                            )}
                            {item.aiOrigin && (
                              <DetailRow label="Origin" value={item.aiOrigin} />
                            )}
                            {item.aiMedium && (
                              <DetailRow label="Medium" value={item.aiMedium} />
                            )}
                            {item.aiDimensions && (
                              <DetailRow label="Dimensions" value={item.aiDimensions} />
                            )}
                            {item.aiCondition && (
                              <DetailRow label="Condition" value={item.aiCondition} />
                            )}
                            {item.aiCategory && (
                              <DetailRow label="Category" value={item.aiCategory} />
                            )}
                          </div>
                          {item.aiDescription && (
                            <div className="mt-2">
                              <p className="text-xs text-muted-foreground">Description</p>
                              <p className="text-sm mt-0.5">{item.aiDescription}</p>
                            </div>
                          )}
                          {item.aiConditionNotes && (
                            <div className="mt-2">
                              <p className="text-xs text-muted-foreground">Condition Notes</p>
                              <p className="text-sm mt-0.5">{item.aiConditionNotes}</p>
                            </div>
                          )}
                          {item.aiTags && item.aiTags.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1">
                              {item.aiTags.map((tag, idx) => (
                                <Badge key={idx} variant="outline" className="text-xs">
                                  {tag}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {/* AI Appraisal Data */}
                      {item.aiProcessedAt && (
                        <div>
                          <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
                            AI Appraisal
                          </p>
                          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                            {item.aiEstimateLow != null && (
                              <DetailRow
                                label="Estimate Low"
                                value={formatCurrency(item.aiEstimateLow)}
                              />
                            )}
                            {item.aiEstimateHigh != null && (
                              <DetailRow
                                label="Estimate High"
                                value={formatCurrency(item.aiEstimateHigh)}
                              />
                            )}
                            {item.aiRecommendedReserve != null && (
                              <DetailRow
                                label="Rec. Reserve"
                                value={formatCurrency(item.aiRecommendedReserve)}
                              />
                            )}
                            {item.aiSuggestedStartingBid != null && (
                              <DetailRow
                                label="Sug. Starting Bid"
                                value={formatCurrency(item.aiSuggestedStartingBid)}
                              />
                            )}
                            {item.aiMarketTrend && (
                              <DetailRow label="Market Trend" value={item.aiMarketTrend} />
                            )}
                          </div>
                          {item.aiReasoning && (
                            <div className="mt-2">
                              <p className="text-xs text-muted-foreground">Reasoning</p>
                              <p className="text-sm mt-0.5 text-muted-foreground">
                                {item.aiReasoning}
                              </p>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Admin overrides applied */}
                      {(item.finalTitle ||
                        item.finalEstimateLow != null ||
                        item.finalEstimateHigh != null ||
                        item.finalReserve != null ||
                        item.finalCategory) && (
                        <div>
                          <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
                            Admin Overrides
                          </p>
                          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                            {item.finalTitle && (
                              <DetailRow label="Title" value={item.finalTitle} />
                            )}
                            {item.finalEstimateLow != null && (
                              <DetailRow
                                label="Estimate Low"
                                value={formatCurrency(item.finalEstimateLow)}
                              />
                            )}
                            {item.finalEstimateHigh != null && (
                              <DetailRow
                                label="Estimate High"
                                value={formatCurrency(item.finalEstimateHigh)}
                              />
                            )}
                            {item.finalReserve != null && (
                              <DetailRow
                                label="Reserve"
                                value={formatCurrency(item.finalReserve)}
                              />
                            )}
                            {item.finalCategory && (
                              <DetailRow label="Category" value={item.finalCategory} />
                            )}
                          </div>
                        </div>
                      )}

                      {/* Lot Link */}
                      {item.lotId && (
                        <div className="pt-2 border-t">
                          <Link
                            href={`/admin/lots/${item.lotId}`}
                            className="text-sm text-champagne hover:underline inline-flex items-center gap-1"
                          >
                            <Package className="h-3 w-3" /> View Lot
                          </Link>
                        </div>
                      )}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* ── 4. Auction Placement Panel ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Auction Placement & Agreement</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Auction ID */}
            <div>
              <label className="text-sm text-muted-foreground block mb-1">
                Auction ID (optional)
              </label>
              <Input
                placeholder="Paste auction UUID..."
                value={auctionId}
                onChange={(e) => setAuctionId(e.target.value)}
                className="font-mono text-sm"
              />
            </div>

            {/* Commission */}
            <div>
              <label className="text-sm text-muted-foreground block mb-1">
                Commission %
              </label>
              <Input
                type="number"
                min={1}
                max={100}
                value={commissionPercent}
                onChange={(e) => setCommissionPercent(e.target.value)}
              />
            </div>

            {/* Summary */}
            <div className="flex flex-col justify-end">
              <p className="text-sm text-muted-foreground mb-2">
                {acceptedCount} accepted item{acceptedCount !== 1 ? 's' : ''} ready for lot
                creation
                {estLow > 0 &&
                  ` (${formatCurrency(estLow)} - ${formatCurrency(estHigh)} est. value)`}
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              onClick={handleCreateLots}
              disabled={creatingLots || !hasAcceptedItems}
              className="bg-champagne text-charcoal hover:bg-champagne/90"
            >
              {creatingLots ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Package className="h-4 w-4 mr-2" />
              )}
              Create Lots & Assign to Auction
            </Button>

            <Button
              variant="outline"
              onClick={handleSendAgreement}
              disabled={sendingAgreement || !hasAcceptedItems || !prospect.email}
            >
              {sendingAgreement ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <FileSignature className="h-4 w-4 mr-2" />
              )}
              Send Agreement ({commissionPercent}%)
            </Button>
          </div>

          {!hasAcceptedItems && (
            <p className="text-xs text-muted-foreground">
              Accept items above before creating lots or sending an agreement.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Detail Row Helper ──

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <span className="text-muted-foreground flex-shrink-0">{label}:</span>
      <span className="truncate">{value}</span>
    </div>
  );
}
