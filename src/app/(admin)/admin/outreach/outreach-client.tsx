'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, Pencil, Download, Search, X, ChevronLeft, ChevronRight, CalendarClock, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import type { OutreachContact } from '@/db/schema/outreach';
import {
  statusColors, categoryLabels, statusLabels, statusOptions, categoryOptions,
  type OutreachStatus,
} from '@/lib/config/outreach';
import { BulkEmailDialog } from './bulk-email-dialog';
import { ImportDialog } from './import-dialog';
import { readFailure, formatDay, todayLocal } from './form-utils';

interface Stats {
  total: number;
  new: number;
  followUp: number;
  interested: number;
  converted: number;
  due: number;
}

interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

const EMPTY_STATS: Stats = { total: 0, new: 0, followUp: 0, interested: 0, converted: 0, due: 0 };

export function OutreachClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Filters live in the URL so the sidebar "due" badge can deep-link and
  // the back button restores the view.
  const statusFilter = searchParams.get('status') || '';
  const categoryFilter = searchParams.get('category') || '';
  const dueOnly = searchParams.get('due') === '1';
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
  const searchQuery = searchParams.get('q') || '';

  const [searchInput, setSearchInput] = useState(searchQuery);
  const [contacts, setContacts] = useState<OutreachContact[]>([]);
  const [stats, setStats] = useState<Stats>(EMPTY_STATS);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, pageSize: 50, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkUpdating, setBulkUpdating] = useState(false);

  function setParams(next: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v === null || v === '') params.delete(k);
      else params.set(k, v);
    }
    // Any filter change restarts at page 1 unless page was set explicitly
    if (!('page' in next)) params.delete('page');
    router.replace(`/admin/outreach${params.size ? `?${params}` : ''}`);
  }

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page) });
    if (statusFilter) params.set('status', statusFilter);
    if (categoryFilter) params.set('category', categoryFilter);
    if (dueOnly) params.set('due', '1');
    if (searchQuery) params.set('search', searchQuery);

    fetch(`/api/admin/outreach?${params}`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await readFailure(r, 'Failed to load contacts')).error);
        return r.json();
      })
      .then((d) => {
        setLoadError(null);
        setContacts(d.data ?? []);
        setStats({ ...EMPTY_STATS, ...(d.stats ?? {}) });
        if (d.pagination) setPagination(d.pagination);
      })
      .catch((err: Error) => {
        setLoadError(err.message);
        toast.error(err.message);
      })
      .finally(() => setLoading(false));
  }, [page, statusFilter, categoryFilter, dueOnly, searchQuery]);

  useEffect(() => { load(); }, [load]);

  // Debounced search → URL
  useEffect(() => {
    if (searchInput === searchQuery) return;
    const t = setTimeout(() => setParams({ q: searchInput.trim() || null }), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === contacts.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(contacts.map((c) => c.id)));
    }
  }

  async function bulkUpdateStatus(newStatus: string) {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    setBulkUpdating(true);
    try {
      const res = await fetch('/api/admin/outreach', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, status: newStatus }),
      });
      if (!res.ok) {
        toast.error((await readFailure(res, 'Failed to update contacts')).error);
        return;
      }
      const d = await res.json();
      const updated: OutreachContact[] = d.data ?? [];
      const missing: string[] = d.missing ?? [];
      setContacts((prev) => prev.map((c) => updated.find((u) => u.id === c.id) ?? c));
      const label = statusLabels[newStatus as OutreachStatus] ?? newStatus;
      if (missing.length > 0) {
        toast.warning(`Updated ${updated.length} of ${ids.length} to "${label}" — ${missing.length} no longer exist`);
      } else {
        toast.success(`Updated ${updated.length} contact${updated.length !== 1 ? 's' : ''} to "${label}"`);
      }
      setSelected(new Set());
      load();
    } catch {
      toast.error('Network error — no contacts were updated');
    } finally {
      setBulkUpdating(false);
    }
  }

  function exportCSV() {
    const rows = contacts.map((c) => ({
      'Company Name': c.companyName,
      'Contact Name': c.contactName || '',
      'Title': c.title || '',
      'Email': c.email || '',
      'Phone': c.phone || '',
      'Website': c.website || '',
      'Category': categoryLabels[c.category] || c.category,
      'Status': statusLabels[c.status] || c.status,
      'Source': c.source || '',
      'Address': c.address || '',
      'City': c.city || '',
      'State': c.state || '',
      'Notes': c.notes || '',
      'Last Contacted': c.lastContactedAt ? new Date(c.lastContactedAt).toLocaleDateString() : '',
      'Next Follow-Up': c.nextFollowUpAt ? formatDay(c.nextFollowUpAt) : '',
    }));
    if (rows.length === 0) {
      toast.error('Nothing to export on this page');
      return;
    }

    const quote = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const headers = Object.keys(rows[0]);
    const csv = [
      headers.map(quote).join(','),
      ...rows.map((r) => headers.map((h) => quote((r as Record<string, string>)[h])).join(',')),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mayells-outreach-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${rows.length} contacts (this page)`);
  }

  const today = todayLocal();
  const hasFilters = !!(statusFilter || categoryFilter || dueOnly || searchQuery);

  return (
    <div>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-8">
        <h1 className="font-display text-display-sm">Outreach</h1>
        <div className="flex flex-wrap items-center gap-2">
          <ImportDialog onImported={load} />
          <Button variant="outline" size="sm" onClick={exportCSV} className="gap-1.5">
            <Download className="h-3.5 w-3.5" /> Export CSV
          </Button>
          <Link href="/admin/outreach/new">
            <Button className="gap-2" size="sm"><Plus className="h-4 w-4" /> Add Contact</Button>
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        {[
          { label: 'Total', value: stats.total, color: 'text-foreground', onClick: () => setParams({ status: null, due: null }) },
          { label: 'New', value: stats.new, color: 'text-blue-600', onClick: () => setParams({ status: 'new', due: null }) },
          { label: 'Follow Up', value: stats.followUp, color: 'text-orange-600', onClick: () => setParams({ status: 'follow_up', due: null }) },
          { label: 'Interested', value: stats.interested, color: 'text-green-600', onClick: () => setParams({ status: 'interested', due: null }) },
          { label: 'Converted', value: stats.converted, color: 'text-emerald-600', onClick: () => setParams({ status: 'converted', due: null }) },
          { label: 'Due / Overdue', value: stats.due, color: stats.due > 0 ? 'text-red-600' : 'text-foreground', onClick: () => setParams({ due: '1', status: null }) },
        ].map((s) => (
          <Card key={s.label} className="cursor-pointer hover:border-champagne/60 transition-colors" onClick={s.onClick}>
            <CardContent className="pt-4 pb-3 text-center">
              <p className={`text-2xl font-semibold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search contacts..."
            className="pl-9 h-9"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>
        <Select value={statusFilter || 'all'} onValueChange={(v) => setParams({ status: v === 'all' ? null : v })}>
          <SelectTrigger className="w-[150px] h-9">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {statusOptions.map((s) => (
              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={categoryFilter || 'all'} onValueChange={(v) => setParams({ category: v === 'all' ? null : v })}>
          <SelectTrigger className="w-[190px] h-9">
            <SelectValue placeholder="All Categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categoryOptions.map((c) => (
              <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <button
          type="button"
          onClick={() => setParams({ due: dueOnly ? null : '1' })}
          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
            dueOnly
              ? 'border-red-300 bg-red-50 text-red-700'
              : 'border-border text-muted-foreground hover:text-foreground hover:border-red-200'
          }`}
        >
          <CalendarClock className="h-3.5 w-3.5" />
          Due today / Overdue
          {stats.due > 0 && <span className="opacity-70">{stats.due}</span>}
        </button>
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={() => { setSearchInput(''); router.replace('/admin/outreach'); }}>
            <X className="h-3.5 w-3.5 mr-1" /> Clear filters
          </Button>
        )}
        <span className="text-sm text-muted-foreground">{pagination.total} contact{pagination.total !== 1 ? 's' : ''}</span>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="bg-muted border rounded-lg px-4 py-3 mb-4 flex items-center gap-3 flex-wrap">
          <span className="text-sm font-medium">{selected.size} selected</span>
          <div className="w-px h-5 bg-border" />
          <Select onValueChange={bulkUpdateStatus} disabled={bulkUpdating}>
            <SelectTrigger className="w-[160px] h-8 text-sm">
              <SelectValue placeholder={bulkUpdating ? 'Updating…' : 'Set status...'} />
            </SelectTrigger>
            <SelectContent>
              {statusOptions.map((s) => (
                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <BulkEmailDialog
            contacts={contacts}
            selectedIds={selected}
            onComplete={(updated) => {
              if (updated.length > 0) {
                setContacts((prev) => prev.map((c) => updated.find((u) => u.id === c.id) ?? c));
              }
              setSelected(new Set());
            }}
          />

          <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
            <X className="h-3.5 w-3.5 mr-1" /> Clear
          </Button>
        </div>
      )}

      {/* Table */}
      {loadError && !loading ? (
        <Card>
          <CardContent className="py-12 text-center">
            <AlertTriangle className="h-10 w-10 text-red-500 mx-auto mb-3" />
            <p className="text-muted-foreground mb-4">{loadError}</p>
            <Button variant="outline" size="sm" onClick={load}>Try again</Button>
          </CardContent>
        </Card>
      ) : (
      <div className="border rounded-lg overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[40px]">
                <Checkbox
                  checked={contacts.length > 0 && selected.size === contacts.length}
                  onCheckedChange={toggleAll}
                  aria-label="Select all on this page"
                />
              </TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Follow Up</TableHead>
              <TableHead className="w-[60px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              [1, 2, 3, 4, 5].map((i) => (
                <TableRow key={i}>
                  <TableCell colSpan={9}><div className="h-6 bg-muted animate-pulse rounded" /></TableCell>
                </TableRow>
              ))
            ) : contacts.map((contact) => {
              const overdue = !!contact.nextFollowUpAt && contact.nextFollowUpAt <= today
                && !['converted', 'not_interested', 'do_not_contact'].includes(contact.status);
              return (
              <TableRow key={contact.id} className={selected.has(contact.id) ? 'bg-muted/50' : ''}>
                <TableCell>
                  <Checkbox
                    checked={selected.has(contact.id)}
                    onCheckedChange={() => toggleSelect(contact.id)}
                    aria-label={`Select ${contact.companyName}`}
                  />
                </TableCell>
                <TableCell>
                  <Link href={`/admin/outreach/${contact.id}`} className="font-medium hover:underline">
                    {contact.companyName}
                  </Link>
                  {contact.city && contact.state && (
                    <p className="text-xs text-muted-foreground">{contact.city}, {contact.state}</p>
                  )}
                </TableCell>
                <TableCell>
                  {contact.contactName && (
                    <div>
                      <p className="text-sm">{contact.contactName}</p>
                      {contact.title && <p className="text-xs text-muted-foreground">{contact.title}</p>}
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="text-[11px]">
                    {categoryLabels[contact.category] || contact.category}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge className={statusColors[contact.status] || ''}>
                    {statusLabels[contact.status] || contact.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{contact.phone || '—'}</TableCell>
                <TableCell className="text-sm text-muted-foreground max-w-[180px] truncate">{contact.email || '—'}</TableCell>
                <TableCell className={`text-sm whitespace-nowrap ${overdue ? 'text-red-600 font-medium' : 'text-muted-foreground'}`}>
                  {contact.nextFollowUpAt ? formatDay(contact.nextFollowUpAt) : '—'}
                </TableCell>
                <TableCell>
                  <Link href={`/admin/outreach/${contact.id}`}>
                    <Button variant="ghost" size="sm" aria-label="Edit"><Pencil className="h-3.5 w-3.5" /></Button>
                  </Link>
                </TableCell>
              </TableRow>
              );
            })}
            {!loading && contacts.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                  {hasFilters ? 'No contacts match your filters.' : 'No outreach contacts yet. Add your first lead or import a CSV.'}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      )}

      {pagination.totalPages > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-3 mt-4 text-sm">
          <p className="text-muted-foreground">
            Page {pagination.page} of {pagination.totalPages} · {pagination.total} contacts
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setParams({ page: String(page - 1) })} className="gap-1">
              <ChevronLeft className="h-3.5 w-3.5" /> Prev
            </Button>
            <Button variant="outline" size="sm" disabled={page >= pagination.totalPages} onClick={() => setParams({ page: String(page + 1) })} className="gap-1">
              Next <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
