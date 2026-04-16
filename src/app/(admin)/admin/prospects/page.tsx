'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
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
  X,
  Copy,
  Check,
  Loader2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

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

const statusColors: Record<ProspectStatus, string> = {
  new: 'bg-gray-100 text-gray-700',
  contacted: 'bg-blue-100 text-blue-700',
  upload_sent: 'bg-yellow-100 text-yellow-700',
  items_received: 'bg-orange-100 text-orange-700',
  under_review: 'bg-purple-100 text-purple-700',
  agreement_sent: 'bg-indigo-100 text-indigo-700',
  agreement_signed: 'bg-green-100 text-green-700',
  accepted: 'bg-emerald-100 text-emerald-700',
  declined: 'bg-red-100 text-red-700',
  archived: 'bg-gray-100 text-gray-500',
};

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

export default function AdminProspectsPage() {
  const router = useRouter();
  const [rows, setRows] = useState<ProspectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [offset, setOffset] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [showDialog, setShowDialog] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [sendingLinkId, setSendingLinkId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchProspects = useCallback(async (pageOffset = 0) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/prospects?limit=${PAGE_SIZE}&offset=${pageOffset}`);
      const data = await res.json();
      setRows(data.data ?? []);
      setTotalCount(data.pagination?.total ?? 0);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProspects(0);
  }, [fetchProspects]);

  const filtered = rows.filter((row) => {
    if (!search) return true;
    const q = search.toLowerCase();
    const p = row.prospect;
    return (
      p.fullName.toLowerCase().includes(q) ||
      p.email?.toLowerCase().includes(q) ||
      p.company?.toLowerCase().includes(q) ||
      p.phone?.toLowerCase().includes(q)
    );
  });

  // Stats — computed from current page; totalCount from API for header
  const total = totalCount;
  const pending = rows.filter((r) => r.prospect.status === 'new').length;
  const itemsReceived = rows.filter((r) => r.prospect.status === 'items_received').length;
  const signed = rows.filter((r) => r.prospect.status === 'agreement_signed').length;

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
      setLoading(true);
      fetchProspects();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create prospect');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSendUploadLink(prospectId: string) {
    setSendingLinkId(prospectId);
    try {
      const res = await fetch(`/api/admin/prospects/${prospectId}/upload-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      const url = data.data?.url;
      if (url) {
        await navigator.clipboard.writeText(url);
        setCopiedId(prospectId);
        toast.success('Upload link copied to clipboard');
        setTimeout(() => setCopiedId(null), 2000);
      }
      fetchProspects();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create upload link');
    } finally {
      setSendingLinkId(null);
    }
  }

  async function handleDelete(prospectId: string, name: string) {
    if (!confirm(`Delete prospect "${name}"? This action cannot be undone.`)) return;

    setDeletingId(prospectId);
    try {
      const res = await fetch(`/api/admin/prospects/${prospectId}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error);
      }
      toast.success('Prospect deleted');
      setRows((prev) => prev.filter((r) => r.prospect.id !== prospectId));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete prospect');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="font-display text-display-sm">Seller Prospects</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage consignment leads and upload links
          </p>
        </div>
        <Button onClick={() => setShowDialog(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Add Prospect
        </Button>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="py-4 px-5 flex items-center gap-3">
            <Users2 className="h-5 w-5 text-muted-foreground shrink-0" />
            <div>
              <p className="text-2xl font-semibold">{total}</p>
              <p className="text-xs text-muted-foreground">Total Prospects</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 px-5 flex items-center gap-3">
            <Clock className="h-5 w-5 text-muted-foreground shrink-0" />
            <div>
              <p className="text-2xl font-semibold">{pending}</p>
              <p className="text-xs text-muted-foreground">Pending Review</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 px-5 flex items-center gap-3">
            <Package className="h-5 w-5 text-muted-foreground shrink-0" />
            <div>
              <p className="text-2xl font-semibold">{itemsReceived}</p>
              <p className="text-xs text-muted-foreground">Items Received</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 px-5 flex items-center gap-3">
            <FileCheck className="h-5 w-5 text-muted-foreground shrink-0" />
            <div>
              <p className="text-2xl font-semibold">{signed}</p>
              <p className="text-xs text-muted-foreground">Agreements Signed</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by name, email, phone, or company..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Table */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-16 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Users2 className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">
              {search ? 'No prospects match your search.' : 'No prospects yet.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="border rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 text-left">
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Contact</th>
                <th className="px-4 py-3 font-medium">Source</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">Items</th>
                <th className="px-4 py-3 font-medium text-right">Est. Value</th>
                <th className="px-4 py-3 font-medium">Created</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(({ prospect: p, uploadItemCount }) => {
                const estLow = p.totalEstimateLow || 0;
                const estHigh = p.totalEstimateHigh || 0;
                const hasEstimate = estLow > 0 || estHigh > 0;

                return (
                  <tr
                    key={p.id}
                    className="border-t hover:bg-accent/5 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium">{p.fullName}</div>
                      {p.company && (
                        <div className="text-xs text-muted-foreground">{p.company}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
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
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-muted-foreground">
                        {sourceLabels[p.source] || p.source}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          'px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap',
                          statusColors[p.status]
                        )}
                      >
                        {p.status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {uploadItemCount > 0 ? uploadItemCount : p.estimatedItemCount ?? '--'}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap">
                      {hasEstimate
                        ? `$${(estLow / 100).toLocaleString()} - $${(estHigh / 100).toLocaleString()}`
                        : '--'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-muted-foreground text-xs">
                      {new Date(p.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          title="View details"
                          onClick={() => router.push(`/admin/prospects/${p.id}`)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          title="Send upload link"
                          disabled={sendingLinkId === p.id}
                          onClick={() => handleSendUploadLink(p.id)}
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
                          disabled={deletingId === p.id}
                          onClick={() => handleDelete(p.id, p.fullName)}
                        >
                          {deletingId === p.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {totalCount > PAGE_SIZE && !search && (
        <div className="flex items-center justify-between mt-4 text-sm">
          <p className="text-muted-foreground">
            {offset + 1}–{Math.min(offset + PAGE_SIZE, totalCount)} of {totalCount}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={offset === 0}
              onClick={() => {
                const next = Math.max(0, offset - PAGE_SIZE);
                setOffset(next);
                fetchProspects(next);
              }}
              className="gap-1"
            >
              <ChevronLeft className="h-3.5 w-3.5" /> Prev
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={offset + PAGE_SIZE >= totalCount}
              onClick={() => {
                const next = offset + PAGE_SIZE;
                setOffset(next);
                fetchProspects(next);
              }}
              className="gap-1"
            >
              Next <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      {/* Add Prospect Dialog */}
      {showDialog && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowDialog(false);
          }}
        >
          <div className="bg-background rounded-lg w-full max-w-md border shadow-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 pb-4 border-b">
              <h2 className="text-lg font-semibold">Add Prospect</h2>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setShowDialog(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <form onSubmit={handleCreate} className="p-6 space-y-4">
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
                <Label htmlFor="itemSummary">Item Summary</Label>
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

              <div className="flex justify-end gap-3 pt-2">
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
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
