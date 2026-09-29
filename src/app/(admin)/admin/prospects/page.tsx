'use client';

import { Suspense, useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { QRCodeSVG } from 'qrcode.react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { PageHeader, filterChipCountClass } from '@/components/admin/PageHeader';
import { FilterChip } from '../_components/FilterChips';
import { Pager } from '../_components/Pager';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Search,
  Plus,
  Users2,
  Clock,
  Package,
  FileCheck,
  Link2,
  Trash2,
  Eye,
  Copy,
  Check,
  Loader2,
  QrCode,
  Download,
  AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { MICROSITE_LABELS, micrositeCity } from '@/lib/microsites/labels';
import { toast } from 'sonner';
import { BUSINESS } from '@/lib/config';
import { PROSPECT_STATUS, PROSPECT_STATUS_ORDER } from '@/lib/admin/status/sales';
import { formatShortDate } from '@/lib/format/dates';
import { formatEstimate } from '@/lib/format/estimate';

// Generic terms page — same base URL config the agreement API uses.
const TERMS_URL = `${BUSINESS.url}/consignment-agreement`;

type ProspectStatus =
  | 'new'
  | 'contacted'
  | 'upload_sent'
  | 'items_received'
  | 'under_review'
  | 'agreement_sent'
  | 'agreement_signed'
  | 'accepted'
  | 'declined'
  | 'archived';

type ProspectSource =
  | 'phone'
  | 'email'
  | 'website'
  | 'referral'
  | 'estate_visit'
  | 'walk_in'
  | 'other';

interface Prospect {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  source: ProspectSource;
  site: string | null;
  status: ProspectStatus;
  estimatedItemCount: number | null;
  itemSummary: string | null;
  notes: string | null;
  totalItems: number;
  reviewedItems: number;
  acceptedItems: number;
  totalEstimateLow: number;
  totalEstimateHigh: number;
  createdAt: string;
}

interface ProspectRow {
  prospect: Prospect;
  uploadLinkCount: number;
  uploadItemCount: number;
}

interface ProspectStats {
  total: number;
  newLeads: number;
  awaitingReview: number;
  signed: number;
  byStatus: Partial<Record<ProspectStatus, number>>;
}

const sourceLabels: Record<ProspectSource, string> = {
  phone: 'Phone',
  email: 'Email',
  website: 'Website',
  referral: 'Referral',
  estate_visit: 'Estate Visit',
  walk_in: 'Walk-in',
  other: 'Other',
};

const emptyForm = {
  fullName: '',
  email: '',
  phone: '',
  company: '',
  source: 'email' as ProspectSource,
  estimatedItemCount: '',
  itemSummary: '',
  notes: '',
};

const PAGE_SIZE = 50;

interface PendingConfirm {
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  variant?: 'default' | 'destructive';
  onConfirm: () => Promise<void>;
}

export default function AdminProspectsPage() {
  // useSearchParams needs a Suspense boundary for the static shell.
  return (
    <Suspense
      fallback={
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-16 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
      }
    >
      <ProspectsPageInner />
    </Suspense>
  );
}

function ProspectsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // ?status= takes one status or a comma-separated set (the dashboard's
  // "awaiting action" link is new,items_received,under_review). The API
  // accepts the same list, so the joined string is passed through as-is.
  const statusFilter = (searchParams.get('status') ?? '')
    .split(',')
    .filter((s): s is ProspectStatus => (PROSPECT_STATUS_ORDER as string[]).includes(s))
    .join(',');
  const activeStatuses = statusFilter ? statusFilter.split(',') : [];

  // Lead origin filter: '' (all), 'any' (every city microsite) or a city slug.
  const siteParam = searchParams.get('site') ?? '';
  const siteFilter = siteParam === 'any' || siteParam in MICROSITE_LABELS ? siteParam : '';

  // ?q= deep link (⌘K command menu) seeds the search box; kept in sync below.
  const urlQuery = searchParams.get('q')?.trim() ?? '';

  const [rows, setRows] = useState<ProspectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [search, setSearch] = useState(urlQuery);
  const [debouncedSearch, setDebouncedSearch] = useState(urlQuery);
  const [offset, setOffset] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [stats, setStats] = useState<ProspectStats | null>(null);
  const [showDialog, setShowDialog] = useState(false);
  const [showTermsDialog, setShowTermsDialog] = useState(false);
  const [termsCopied, setTermsCopied] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [sendingLinkId, setSendingLinkId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingConfirm | null>(null);

  const fetchProspects = useCallback(async (pageOffset = 0, searchTerm = '', status = '', site = '') => {
    setLoading(true);
    setFetchError(false);
    try {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(pageOffset),
      });
      if (searchTerm) params.set('search', searchTerm);
      if (status) params.set('status', status);
      if (site) params.set('site', site);
      const res = await fetch(`/api/admin/prospects?${params.toString()}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to load prospects');
      setRows(data.data ?? []);
      setTotalCount(data.pagination?.total ?? 0);
      if (data.stats) setStats(data.stats);
    } catch (err) {
      setRows([]);
      setFetchError(true);
      toast.error(err instanceof Error ? err.message : 'Failed to load prospects');
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounce the search box, then query server-side so all prospects are
  // covered (not just the loaded page).
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setOffset(0);
    fetchProspects(0, debouncedSearch, statusFilter, siteFilter);
  }, [debouncedSearch, statusFilter, siteFilter, fetchProspects]);

  // URL → box: a new ?q= arrived (command menu search while on this page).
  useEffect(() => {
    if (urlQuery !== debouncedSearch) {
      setSearch(urlQuery);
      setDebouncedSearch(urlQuery);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlQuery]);

  // Box → URL: keep ?q= shareable alongside ?status= and ?site=.
  useEffect(() => {
    if (debouncedSearch === urlQuery) return;
    const params = new URLSearchParams(searchParams.toString());
    if (debouncedSearch) params.set('q', debouncedSearch);
    else params.delete('q');
    const qs = params.toString();
    router.replace(`/admin/prospects${qs ? `?${qs}` : ''}`, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  function setSiteFilter(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (next) params.set('site', next);
    else params.delete('site');
    const qs = params.toString();
    router.replace(`/admin/prospects${qs ? `?${qs}` : ''}`, { scroll: false });
  }

  function setStatusFilter(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (next) params.set('status', next);
    else params.delete('status');
    const qs = params.toString();
    router.replace(`/admin/prospects${qs ? `?${qs}` : ''}`, { scroll: false });
  }

  // Stats — global counts from the API, not current-page counts
  const total = stats?.total ?? totalCount;
  const newLeads = stats?.newLeads ?? 0;
  const awaitingReview = stats?.awaitingReview ?? 0;
  const signed = stats?.signed ?? 0;

  function copyTermsLink() {
    navigator.clipboard.writeText(TERMS_URL);
    setTermsCopied(true);
    toast.success('Terms link copied');
    setTimeout(() => setTermsCopied(false), 2000);
  }

  function downloadTermsQR() {
    const svg = document.getElementById('terms-qr');
    if (!svg) return;
    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new window.Image();
    img.onload = () => {
      canvas.width = 512;
      canvas.height = 512;
      ctx?.drawImage(img, 0, 0, 512, 512);
      const link = document.createElement('a');
      link.download = 'mayells-consignment-terms-qr.png';
      link.href = canvas.toDataURL('image/png');
      link.click();
    };
    img.src = 'data:image/svg+xml;base64,' + btoa(svgData);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.fullName.trim()) return;

    setSubmitting(true);
    try {
      const res = await fetch('/api/admin/prospects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: form.fullName.trim(),
          email: form.email.trim() || undefined,
          phone: form.phone.trim() || undefined,
          company: form.company.trim() || undefined,
          source: form.source,
          estimatedItemCount: form.estimatedItemCount
            ? parseInt(form.estimatedItemCount, 10)
            : undefined,
          itemSummary: form.itemSummary.trim() || undefined,
          notes: form.notes.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      toast.success(`Prospect "${form.fullName}" created`);
      setForm(emptyForm);
      setShowDialog(false);
      setOffset(0);
      fetchProspects(0, debouncedSearch, statusFilter, siteFilter);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create prospect');
    } finally {
      setSubmitting(false);
    }
  }

  async function doSendUploadLink(prospectId: string) {
    setSendingLinkId(prospectId);
    try {
      const res = await fetch(`/api/admin/prospects/${prospectId}/upload-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create upload link');

      const url = data.data?.url;
      if (url) {
        try {
          await navigator.clipboard.writeText(url);
          setCopiedId(prospectId);
          setTimeout(() => setCopiedId(null), 2000);
        } catch {
          // Clipboard can be unavailable (insecure context / permissions).
        }
        toast.success(
          data.data?.emailed
            ? `${data.data?.reused ? 'Existing' : 'New'} upload link emailed and copied to clipboard`
            : 'Upload link copied to clipboard (no email on file)',
        );
      }
      fetchProspects(offset, debouncedSearch, statusFilter, siteFilter);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create upload link');
    } finally {
      setSendingLinkId(null);
    }
  }

  function confirmSendUploadLink(p: Prospect) {
    setPending({
      title: 'Send upload link?',
      description: p.email ? (
        <>
          This emails a private upload link to <strong>{p.fullName}</strong> at {p.email}. If an
          active link already exists it is re-sent rather than replaced.
        </>
      ) : (
        <>
          <strong>{p.fullName}</strong> has no email on file. A link will be created and copied to
          your clipboard for you to share.
        </>
      ),
      confirmLabel: p.email ? 'Send link' : 'Create link',
      onConfirm: () => doSendUploadLink(p.id),
    });
  }

  async function doDelete(prospectId: string) {
    setDeletingId(prospectId);
    try {
      const res = await fetch(`/api/admin/prospects/${prospectId}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to delete prospect');
      }
      toast.success('Prospect deleted');
      // Refetch so the stats cards and pagination reflect the removal.
      fetchProspects(offset, debouncedSearch, statusFilter, siteFilter);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete prospect');
    } finally {
      setDeletingId(null);
    }
  }

  function confirmDelete(p: Prospect) {
    setPending({
      title: `Delete ${p.fullName}?`,
      description: 'This removes the prospect, their upload links, and every uploaded item. This cannot be undone. Prospects whose items became lots cannot be deleted — archive them instead.',
      confirmLabel: 'Delete',
      variant: 'destructive',
      onConfirm: () => doDelete(p.id),
    });
  }

  return (
    <div>
      <PageHeader
        title="Prospects"
        description="Consignment leads and their upload links"
        actions={
          <>
            <Button variant="outline" onClick={() => setShowTermsDialog(true)}>
              <QrCode className="h-4 w-4 mr-2" />
              Terms link / QR
            </Button>
            <Button onClick={() => setShowDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add prospect
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="py-4 px-5 flex items-center gap-3">
              <Users2 className="h-5 w-5 text-muted-foreground shrink-0" />
              <div>
                <p className="text-2xl font-semibold">{total}</p>
                <p className="text-xs text-muted-foreground">Total prospects</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4 px-5 flex items-center gap-3">
              <Clock className="h-5 w-5 text-muted-foreground shrink-0" />
              <div>
                <p className="text-2xl font-semibold">{newLeads}</p>
                <p className="text-xs text-muted-foreground">New leads</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4 px-5 flex items-center gap-3">
              <Package className="h-5 w-5 text-muted-foreground shrink-0" />
              <div>
                <p className="text-2xl font-semibold">{awaitingReview}</p>
                <p className="text-xs text-muted-foreground">Awaiting review</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4 px-5 flex items-center gap-3">
              <FileCheck className="h-5 w-5 text-muted-foreground shrink-0" />
              <div>
                <p className="text-2xl font-semibold">{signed}</p>
                <p className="text-xs text-muted-foreground">Agreements signed</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </PageHeader>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by name, email, phone, or company..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Status filter chips */}
      <div role="group" aria-label="Filter by status" className="flex flex-wrap gap-2 mb-6">
        <FilterChip active={statusFilter === ''} onClick={() => setStatusFilter('')}>
          All
          {stats ? <span className={filterChipCountClass}>{stats.total}</span> : null}
        </FilterChip>
        {PROSPECT_STATUS_ORDER.map((value) => {
          const count = stats?.byStatus?.[value] ?? 0;
          const active = activeStatuses.includes(value);
          return (
            <FilterChip
              key={value}
              active={active}
              // Clicking an active chip that is the only filter clears it;
              // otherwise the chip becomes the single filter.
              onClick={() => setStatusFilter(active && activeStatuses.length === 1 ? '' : value)}
            >
              {PROSPECT_STATUS[value].label}
              {stats ? <span className={filterChipCountClass}>{count}</span> : null}
            </FilterChip>
          );
        })}
      </div>

      {/* Lead origin filter */}
      <div className="flex items-center gap-2 -mt-3 mb-6">
        <label htmlFor="site-filter" className="text-xs text-muted-foreground">From</label>
        <select
          id="site-filter"
          value={siteFilter}
          onChange={(e) => setSiteFilter(e.target.value)}
          className="h-8 rounded-md border bg-background px-2 text-xs"
        >
          <option value="">Anywhere</option>
          <option value="any">Any city microsite</option>
          {Object.entries(MICROSITE_LABELS).map(([slug, { city }]) => (
            <option key={slug} value={slug}>{city} microsite</option>
          ))}
        </select>
      </div>

      {/* Table */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-16 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
      ) : fetchError ? (
        <Card>
          <CardContent className="py-12 text-center">
            <AlertCircle className="h-10 w-10 text-destructive mx-auto mb-3" />
            <p className="text-muted-foreground mb-4">
              Failed to load prospects. Please check your connection and try again.
            </p>
            <Button variant="outline" onClick={() => fetchProspects(offset, debouncedSearch, statusFilter, siteFilter)}>
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Users2 className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">
              {debouncedSearch || statusFilter || siteFilter ? 'No prospects match your filters.' : 'No prospects yet.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="border rounded-lg overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Items</TableHead>
                <TableHead className="text-right">Est. Value</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ prospect: p, uploadItemCount }) => {
                const estLow = p.totalEstimateLow || 0;
                const estHigh = p.totalEstimateHigh || 0;
                const hasEstimate = estLow > 0 || estHigh > 0;
                const href = `/admin/prospects/${p.id}`;

                return (
                  <TableRow
                    key={p.id}
                    onClick={() => router.push(href)}
                    className="cursor-pointer"
                  >
                    <TableCell>
                      <div className="font-medium">{p.fullName}</div>
                      {p.company && (
                        <div className="text-xs text-muted-foreground">{p.company}</div>
                      )}
                    </TableCell>
                    <TableCell>
                      {p.email && (
                        <div className="text-xs text-muted-foreground truncate max-w-[180px]">
                          {p.email}
                        </div>
                      )}
                      {p.phone && (
                        <div className="text-xs text-muted-foreground">{p.phone}</div>
                      )}
                      {!p.email && !p.phone && (
                        <span className="text-xs text-muted-foreground">--</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground">
                        {sourceLabels[p.source] || p.source}
                      </span>
                      {p.site && (
                        <div className="text-[11px] font-medium text-champagne-deep whitespace-nowrap">
                          {micrositeCity(p.site)} site
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          'px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap',
                          PROSPECT_STATUS[p.status]?.className
                        )}
                      >
                        {PROSPECT_STATUS[p.status]?.label ?? p.status}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {uploadItemCount > 0 ? uploadItemCount : p.estimatedItemCount ?? '--'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums whitespace-nowrap">
                      {hasEstimate ? formatEstimate(estLow, estHigh) : '--'}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground text-xs">
                      {formatShortDate(p.createdAt)}
                    </TableCell>
                    <TableCell>
                      {/* Action buttons must not trigger the row navigation. */}
                      <div
                        className="flex items-center justify-end gap-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          title="View details"
                          aria-label={`View details — ${p.fullName}`}
                          onClick={() => router.push(href)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          title="Send upload link"
                          aria-label={`Send upload link — ${p.fullName}`}
                          disabled={sendingLinkId === p.id}
                          onClick={() => confirmSendUploadLink(p)}
                        >
                          {sendingLinkId === p.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : copiedId === p.id ? (
                            <Check className="h-4 w-4 text-green-600" />
                          ) : (
                            <Link2 className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          title="Delete prospect"
                          aria-label={`Delete prospect — ${p.fullName}`}
                          disabled={deletingId === p.id}
                          onClick={() => confirmDelete(p)}
                        >
                          {deletingId === p.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {!fetchError && (
        <Pager
          page={Math.floor(offset / PAGE_SIZE) + 1}
          totalPages={Math.ceil(totalCount / PAGE_SIZE)}
          onPageChange={(nextPage) => {
            const next = Math.max(0, (nextPage - 1) * PAGE_SIZE);
            setOffset(next);
            fetchProspects(next, debouncedSearch, statusFilter, siteFilter);
          }}
          summary={<>{offset + 1}–{Math.min(offset + PAGE_SIZE, totalCount)} of {totalCount}</>}
        />
      )}

      {/* Confirm (send link / delete) */}
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

      {/* Terms Link / QR Dialog (replaces the retired /admin/agreements page) */}
      <Dialog open={showTermsDialog} onOpenChange={setShowTermsDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Consignment terms</DialogTitle>
            <DialogDescription>
              Share the public consignment terms page. Print or display the QR
              code — clients can scan it to read the agreement on their phone.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="bg-white rounded-xl p-6 flex flex-col items-center border">
              <QRCodeSVG
                id="terms-qr"
                value={TERMS_URL}
                size={180}
                level="H"
                bgColor="#FFFFFF"
                fgColor="#272D35"
              />
              <p className="text-xs text-muted-foreground mt-3">Scan to view terms</p>
            </div>

            <div className="flex gap-2">
              <Input readOnly value={TERMS_URL} aria-label="Terms page link" className="text-xs bg-muted" />
              <Button variant="outline" size="icon" onClick={copyTermsLink} title="Copy link" aria-label="Copy terms link">
                {termsCopied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>

            <Button variant="outline" className="w-full gap-2" onClick={downloadTermsQR}>
              <Download className="h-4 w-4" />
              Download QR Code (PNG)
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Prospect Dialog. The form state lives on this page, so closing
          the dialog (Esc, backdrop, X) keeps whatever was typed until the
          prospect is created. */}
      <Dialog open={showDialog} onOpenChange={(o) => !submitting && setShowDialog(o)}>
        <DialogContent className="sm:max-w-md" showCloseButton={!submitting}>
          <DialogHeader>
            <DialogTitle>Add prospect</DialogTitle>
            <DialogDescription>A consignment lead. You can send them an upload link afterwards.</DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fullName">
                Full Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="fullName"
                required
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                placeholder="Jane Doe"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="jane@example.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="(555) 123-4567"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="company">Company</Label>
              <Input
                id="company"
                value={form.company}
                onChange={(e) => setForm({ ...form, company: e.target.value })}
                placeholder="Optional"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="source">Source</Label>
                <select
                  id="source"
                  value={form.source}
                  onChange={(e) =>
                    setForm({ ...form, source: e.target.value as ProspectSource })
                  }
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  {Object.entries(sourceLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="estimatedItemCount">Est. Item Count</Label>
                <Input
                  id="estimatedItemCount"
                  type="number"
                  min="0"
                  value={form.estimatedItemCount}
                  onChange={(e) =>
                    setForm({ ...form, estimatedItemCount: e.target.value })
                  }
                  placeholder="0"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="itemSummary">Item summary</Label>
              <textarea
                id="itemSummary"
                rows={2}
                value={form.itemSummary}
                onChange={(e) => setForm({ ...form, itemSummary: e.target.value })}
                placeholder="Brief description of items..."
                className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <textarea
                id="notes"
                rows={2}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Internal notes..."
                className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
              />
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowDialog(false)}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={submitting || !form.fullName.trim()}>
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  'Create Prospect'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
