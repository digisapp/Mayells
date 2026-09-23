'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Loader2,
  Send,
  Copy,
  CheckCircle,
  AlertCircle,
  Clock,
  Pencil,
  Camera,
  ChevronDown,
  ChevronUp,
  Users2,
  Play,
  ExternalLink,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatCurrency } from '@/types';
import { ItemEditSheet } from '@/components/admin/ItemEditSheet';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { BUSINESS } from '@/lib/config';
import { PhotoUploadPanel } from '../_components/PhotoUploadPanel';
import { PageHeader } from '@/components/admin/PageHeader';

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
  prospectId: string | null;
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
  adminNotes: string | null;
}

interface PendingConfirm {
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  variant?: 'default' | 'destructive';
  onConfirm: () => Promise<void>;
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

// visit_date is a date-only value; format in UTC so it never renders a day
// early for viewers west of Greenwich.
function formatVisitDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { timeZone: 'UTC' });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function AppraisalDetailPage() {
  const { visitId } = useParams<{ visitId: string }>();
  const router = useRouter();
  const [visit, setVisit] = useState<EstateVisit | null>(null);
  const [items, setItems] = useState<EstateVisitItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [converting, setConverting] = useState(false);
  const [editingItem, setEditingItem] = useState<EstateVisitItem | null>(null);
  const [editingClient, setEditingClient] = useState(false);
  const [savingClient, setSavingClient] = useState(false);
  const [clientForm, setClientForm] = useState({ name: '', email: '', phone: '' });
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const [addPhotosOpen, setAddPhotosOpen] = useState<boolean | null>(null);
  const [analysisRunning, setAnalysisRunning] = useState(false);

  // Single-flight guard: only one /process request from this page at a time.
  const processingRef = useRef(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/appraisals/${visitId}/items`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Failed to load appraisal');
      setVisit(json.visit);
      setItems(json.data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load appraisal');
    } finally {
      setLoading(false);
    }
  }, [visitId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  /**
   * Drive the AI batches: call /process, refresh, and only call again when
   * the previous response said there is more to do. `processingRef` keeps
   * a poll-triggered re-render from starting a second concurrent loop.
   */
  const runBatches = useCallback(async () => {
    if (processingRef.current) return;
    processingRef.current = true;
    setAnalysisRunning(true);
    try {
      for (;;) {
        const res = await fetch(`/api/admin/appraisals/${visitId}/process`, { method: 'POST' });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast.error(json.error || 'AI analysis failed');
          break;
        }
        await fetchData();
        if (json.done) break;
        // Another run holds the remaining items — give it time before asking again.
        if (!json.batchProcessed) await sleep(4000);
      }
    } catch {
      toast.error('Network error during AI analysis');
    } finally {
      processingRef.current = false;
      setAnalysisRunning(false);
    }
  }, [visitId, fetchData]);

  const visitStatus = visit?.status;
  const hasPending = items.some((i) => i.status === 'pending');

  // Poll while work is in flight so progress and item cards update.
  useEffect(() => {
    if (visitStatus !== 'processing' && visitStatus !== 'uploading') return;
    const interval = setInterval(fetchData, 4000);
    return () => clearInterval(interval);
  }, [visitStatus, fetchData]);

  // Kick off (or resume) analysis: freshly uploaded photos, or a processing
  // visit this page just opened. runBatches dedupes itself.
  useEffect(() => {
    if (visitStatus === 'processing' || (visitStatus === 'uploading' && hasPending)) {
      runBatches();
    }
  }, [visitStatus, hasPending, runBatches]);

  async function doSendReport() {
    if (!visit?.clientEmail) return;
    setSending(true);
    try {
      const res = await fetch(`/api/admin/appraisals/${visitId}/send`, { method: 'POST' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Failed to send report');
      toast.success(`Report ${json.resent ? 'resent' : 'sent'} to ${visit.clientEmail}`);
      fetchData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send report');
    } finally {
      setSending(false);
    }
  }

  function requestSendReport() {
    if (!visit) return;
    if (!visit.clientEmail) {
      toast.error('Client email is required to send the report');
      return;
    }
    const resend = visit.status === 'sent';
    setPending({
      title: resend ? 'Resend the report?' : 'Send report to client?',
      description: (
        <>
          This emails the appraisal report link to <strong>{visit.clientName}</strong> at {visit.clientEmail}.
          {resend && visit.sentAt && <> They already received it on {new Date(visit.sentAt).toLocaleDateString()}.</>}
        </>
      ),
      confirmLabel: resend ? 'Resend' : 'Send',
      onConfirm: doSendReport,
    });
  }

  const handleCopyLink = () => {
    if (!visit) return;
    navigator.clipboard.writeText(`${BUSINESS.url}/appraisal-report/${visit.reportToken}`);
    toast.success('Report link copied');
  };

  async function handleConvert() {
    setConverting(true);
    try {
      const res = await fetch(`/api/admin/appraisals/${visitId}/convert`, { method: 'POST' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Failed to convert to prospect');
      toast.success(json.data?.existing ? 'Already converted — opening the prospect' : 'Prospect created from this visit');
      router.push(`/admin/prospects/${json.data.prospectId}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to convert to prospect');
    } finally {
      setConverting(false);
    }
  }

  const handleItemUpdate = async (itemId: string, updates: Partial<EstateVisitItem>) => {
    try {
      const res = await fetch(`/api/admin/appraisals/${visitId}/items`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId, ...updates }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Failed to update item');
      toast.success('Item updated');
      setEditingItem(null);
      fetchData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update item');
    }
  };

  const handleItemDelete = async (itemId: string) => {
    try {
      const res = await fetch(`/api/admin/appraisals/${visitId}/items`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Failed to delete item');
      toast.success('Item removed');
      setEditingItem(null);
      fetchData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete item');
    }
  };

  const handleReprocess = async (itemId: string) => {
    try {
      const resetRes = await fetch(`/api/admin/appraisals/${visitId}/items`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId, status: 'pending', errorMessage: null }),
      });
      const json = await resetRes.json().catch(() => ({}));
      if (!resetRes.ok) throw new Error(json.error || 'Failed to reset item');
      toast.success('Re-analyzing item...');
      setEditingItem(null);
      await fetchData();
      runBatches();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to reprocess');
    }
  };

  const openClientEdit = () => {
    if (!visit) return;
    setClientForm({
      name: visit.clientName,
      email: visit.clientEmail || '',
      phone: visit.clientPhone || '',
    });
    setEditingClient(true);
  };

  const handleClientSave = async () => {
    if (!clientForm.name.trim()) {
      toast.error('Client name is required');
      return;
    }
    setSavingClient(true);
    try {
      const res = await fetch('/api/admin/appraisals', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: visitId,
          clientName: clientForm.name.trim(),
          clientEmail: clientForm.email.trim(),
          clientPhone: clientForm.phone.trim(),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || 'Failed to update client info');
      }
      toast.success('Client info updated');
      setEditingClient(false);
      fetchData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update client info');
    } finally {
      setSavingClient(false);
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
    return (
      <div>
        <PageHeader title="Appraisal not found" description="This appraisal does not exist or could not be loaded." />
        <Link href="/admin/appraisals" className="text-sm underline underline-offset-2 text-muted-foreground hover:text-foreground">
          All appraisals
        </Link>
      </div>
    );
  }

  const progress = visit.itemCount > 0 ? (visit.processedCount / visit.itemCount) * 100 : 0;
  const canSend = visit.status === 'review' || visit.status === 'sent';
  const canConvert = visit.status === 'review' || visit.status === 'sent';
  const isBusy = visit.status === 'processing' || visit.status === 'uploading';
  // Open the panel by default when there's nothing to look at yet.
  const showAddPhotos = addPhotosOpen ?? items.length === 0;
  const pendingCount = items.filter((i) => i.status === 'pending').length;

  return (
    <div>
      <PageHeader
        title={visit.clientName}
        badges={
          <>
            <Badge variant="outline" className={statusColors[visit.status] || ''}>
              {visit.status}
            </Badge>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-muted-foreground"
              onClick={openClientEdit}
              aria-label="Edit client info"
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          </>
        }
        description={
          <>
            {[visit.clientCity, visit.clientState].filter(Boolean).join(', ')}
            {visit.visitDate && ` · ${formatVisitDate(visit.visitDate)}`}
            {!visit.clientEmail && (
              <span className="text-orange-600"> · No client email on file</span>
            )}
          </>
        }
        actions={
          <>
            <Button variant="outline" size="sm" onClick={handleCopyLink}>
              <Copy className="h-4 w-4 mr-1" />
              Copy link
            </Button>
            {canConvert && (
              visit.prospectId ? (
                <Button asChild variant="outline" size="sm">
                  <Link href={`/admin/prospects/${visit.prospectId}`}>
                    <Users2 className="h-4 w-4 mr-1" />
                    View prospect
                  </Link>
                </Button>
              ) : (
                <Button variant="outline" size="sm" onClick={handleConvert} disabled={converting || items.length === 0}>
                  {converting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Users2 className="h-4 w-4 mr-1" />}
                  Convert to prospect
                </Button>
              )
            )}
            {canSend && (
              <Button
                size="sm"
                className="bg-champagne text-charcoal hover:bg-champagne/90"
                onClick={requestSendReport}
                disabled={sending || !visit.clientEmail}
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Send className="h-4 w-4 mr-1" />}
                {visit.status === 'sent' ? 'Resend report' : 'Send to client'}
              </Button>
            )}
          </>
        }
      />

      {/* Progress Bar (during processing) */}
      {isBusy && (
        <Card className="mb-6">
          <CardContent className="py-5">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-champagne" />
                <span className="text-sm font-medium">
                  {analysisRunning ? 'AI Analysis in Progress' : 'Waiting for AI analysis'}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground">
                  {visit.processedCount} of {visit.itemCount} items
                </span>
                {!analysisRunning && (
                  <Button size="sm" variant="outline" onClick={runBatches}>
                    <Play className="h-3.5 w-3.5 mr-1" /> Resume
                  </Button>
                )}
              </div>
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

      {/* Pending items on a settled visit (e.g. reset for re-analysis) */}
      {!isBusy && pendingCount > 0 && (
        <Card className="mb-6 border-yellow-200 bg-yellow-50">
          <CardContent className="py-4 flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm text-yellow-900">
              {pendingCount} item{pendingCount !== 1 ? 's' : ''} waiting for AI analysis.
            </span>
            <Button size="sm" onClick={runBatches} disabled={analysisRunning} className="bg-yellow-600 hover:bg-yellow-700 text-white">
              {analysisRunning ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Play className="h-4 w-4 mr-1" />}
              Start analysis
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Sent confirmation */}
      {visit.status === 'sent' && visit.sentAt && (
        <Card className="mb-6 border-green-200 bg-green-50">
          <CardContent className="py-4 flex flex-wrap items-center gap-3">
            <CheckCircle className="h-5 w-5 text-green-600 shrink-0" />
            <span className="text-sm text-green-800">
              Report sent to {visit.clientEmail} on{' '}
              {new Date(visit.sentAt).toLocaleDateString()}
            </span>
            <a
              href={`${BUSINESS.url}/appraisal-report/${visit.reportToken}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-green-800/80 hover:text-green-900 inline-flex items-center gap-1 ml-auto"
            >
              <ExternalLink className="h-3.5 w-3.5" /> Open report
            </a>
          </CardContent>
        </Card>
      )}

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-2xl font-display">{visit.itemCount}</p>
            <p className="text-xs text-muted-foreground">Total items</p>
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
            <p className="text-xs text-muted-foreground">Total estimate</p>
          </CardContent>
        </Card>
      </div>

      {/* Add photos */}
      <Card className="mb-6">
        <CardHeader className="pb-3">
          <button
            type="button"
            className="flex items-center justify-between w-full text-left"
            onClick={() => setAddPhotosOpen(!showAddPhotos)}
            aria-expanded={showAddPhotos}
          >
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Camera className="h-4 w-4" />
              {items.length === 0 ? 'Add photos to start' : 'Add more photos'}
            </CardTitle>
            {showAddPhotos ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </button>
        </CardHeader>
        {showAddPhotos && (
          <CardContent>
            {items.length === 0 && (
              <p className="text-sm text-muted-foreground mb-4">
                This visit has no items yet. Upload one photo per item — AI analysis starts as soon as the upload finishes.
              </p>
            )}
            <PhotoUploadPanel
              visitId={visitId}
              ctaLabel={items.length === 0 ? 'Upload & Start AI Analysis' : 'Upload & Analyze'}
              onComplete={async () => {
                await fetchData();
                runBatches();
              }}
            />
          </CardContent>
        )}
      </Card>

      {/* Items Grid */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Items ({items.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No items yet.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {items.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setEditingItem(item)}
                  className="text-left border rounded-xl overflow-hidden hover:shadow-md transition-shadow group"
                >
                  <div className="aspect-square relative">
                    {/* eslint-disable-next-line @next/next/no-img-element -- admin thumbnail / local file preview */}
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
                      {item.title || (item.status === 'error' ? 'Analysis failed' : 'Pending analysis...')}
                    </p>
                    {item.condition && (
                      <p className="text-[11px] text-muted-foreground mt-0.5 capitalize">
                        {item.condition.replace('_', ' ')}
                      </p>
                    )}
                    {item.estimateLow != null && item.estimateHigh != null ? (
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
          )}
        </CardContent>
      </Card>

      {/* Confirm (send / resend) */}
      {pending && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setPending(null)}
          title={pending.title}
          description={pending.description}
          confirmLabel={pending.confirmLabel}
          variant={pending.variant}
          onConfirm={pending.onConfirm}
        />
      )}

      {/* Edit Client Info Dialog */}
      <Dialog open={editingClient} onOpenChange={(open) => !open && setEditingClient(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit client info</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="clientName">Name</Label>
              <Input
                id="clientName"
                value={clientForm.name}
                onChange={(e) => setClientForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="clientEmail">Email</Label>
              <Input
                id="clientEmail"
                type="email"
                value={clientForm.email}
                onChange={(e) => setClientForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="client@example.com"
              />
              <p className="text-[11px] text-muted-foreground">
                Required to send the report to the client.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="clientPhone">Phone</Label>
              <Input
                id="clientPhone"
                type="tel"
                value={clientForm.phone}
                onChange={(e) => setClientForm((f) => ({ ...f, phone: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setEditingClient(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              className="bg-champagne text-charcoal hover:bg-champagne/90"
              onClick={handleClientSave}
              disabled={savingClient}
            >
              {savingClient && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
