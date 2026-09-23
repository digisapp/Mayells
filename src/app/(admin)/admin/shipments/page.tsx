'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Package, ExternalLink, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { PageHeader } from '@/components/admin/PageHeader';
import { SHIPMENT_TRANSITIONS, type ShipmentStatus } from '@/lib/shipping/transitions';
import { formatCurrencyWithCents } from '@/types';
import { toast } from 'sonner';

interface AddressForm {
  name: string;
  phone: string;
  email: string;
  street: string;
  street2: string;
  city: string;
  state: string;
  zip: string;
  country: string;
}

interface ShipmentRow {
  shipment: {
    id: string;
    status: ShipmentStatus;
    method: string;
    carrier: string | null;
    trackingNumber: string | null;
    trackingUrl: string | null;
    labelUrl: string | null;
    shippingCost: number;
    insuranceCost: number;
    insuranceValue: number | null;
    weightLbs: number | null;
    weightOz: number | null;
    lengthIn: number | null;
    widthIn: number | null;
    heightIn: number | null;
    fromName: string;
    fromPhone: string | null;
    fromEmail: string | null;
    fromStreet: string | null;
    fromStreet2: string | null;
    fromCity: string | null;
    fromState: string | null;
    fromZip: string | null;
    fromCountry: string;
    toName: string;
    toPhone: string | null;
    toEmail: string | null;
    toStreet: string | null;
    toStreet2: string | null;
    toCity: string | null;
    toState: string | null;
    toZip: string | null;
    toCountry: string;
    internalNotes: string | null;
    shippedAt: string | null;
    deliveredAt: string | null;
    buyerNotifiedAt: string | null;
    sellerNotifiedAt: string | null;
    createdAt: string;
  };
  seller: { id: string; fullName: string | null; email: string };
  buyer: { id: string; fullName: string | null; email: string };
  lot: { id: string; title: string; lotNumber: number | null };
  invoice: { id: string; invoiceNumber: string; status: string };
}

interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

interface ShipmentStats {
  pending: number;
  needsAddress: number;
  inTransit: number;
  delivered: number;
  exception: number;
  cancelled: number;
}

const METHODS = ['standard', 'pickup', 'white_glove'] as const;
const CARRIERS = ['fedex', 'ups', 'usps', 'dhl', 'arta', 'other'] as const;

const STATUS_FILTERS = ['all', 'pending', 'needs_address', 'in_transit', 'delivered', 'exception', 'cancelled'] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

const FILTER_LABELS: Record<StatusFilter, string> = {
  all: 'All',
  pending: 'Pending',
  needs_address: 'Needs address',
  in_transit: 'In transit',
  delivered: 'Delivered',
  exception: 'Exception / returned',
  cancelled: 'Cancelled',
};

const statusColors: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  pending: 'outline',
  needs_address: 'destructive',
  label_created: 'secondary',
  pickup_scheduled: 'secondary',
  picked_up: 'secondary',
  in_transit: 'default',
  out_for_delivery: 'default',
  delivered: 'default',
  exception: 'destructive',
  returned: 'destructive',
  cancelled: 'secondary',
};

interface Form {
  status: ShipmentStatus;
  method: string;
  carrier: string;
  trackingNumber: string;
  trackingUrl: string;
  internalNotes: string;
  weightLbs: string;
  weightOz: string;
  lengthIn: string;
  widthIn: string;
  heightIn: string;
  from: AddressForm;
  to: AddressForm;
}

async function readBody(res: Response): Promise<Record<string, unknown> | null> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function errorMessage(res: Response, body: Record<string, unknown> | null, fallback: string): string {
  const err = body?.error;
  return typeof err === 'string' && err ? err : `${fallback} (HTTP ${res.status})`;
}

function label(s: string): string {
  return s.replace(/_/g, ' ');
}

function intOrNull(v: string): number | null {
  const t = v.trim();
  if (!t) return null;
  const n = Number.parseInt(t, 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function addressLine(a: { street: string | null; city: string | null; state: string | null; zip: string | null }): string {
  if (!a.street && !a.zip) return 'No address';
  return [a.street, [a.city, a.state].filter(Boolean).join(', '), a.zip].filter(Boolean).join(' · ');
}

export default function AdminShipmentsPage() {
  const [shipments, setShipments] = useState<ShipmentRow[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, pageSize: 50, total: 0, totalPages: 0 });
  const [stats, setStats] = useState<ShipmentStats>({ pending: 0, needsAddress: 0, inTransit: 0, delivered: 0, exception: 0, cancelled: 0 });
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [editing, setEditing] = useState<ShipmentRow | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // Filters can arrive in the URL (the dashboard and settlement pages link
  // here with ?status= / ?q=). Read them once on mount, then fetch.
  const [ready, setReady] = useState(false);

  const fetchShipments = useCallback(async (page: number, status: StatusFilter, q: string, silent = false) => {
    if (!silent) setLoading(true);
    setLoadError(false);
    const params = new URLSearchParams({ page: String(page) });
    if (status !== 'all') params.set('status', status);
    if (q) params.set('q', q);
    try {
      const res = await fetch(`/api/admin/shipments?${params}`);
      const body = await readBody(res);
      if (!res.ok || !body) throw new Error(errorMessage(res, body, 'Failed to load shipments'));
      setShipments((body.data as ShipmentRow[]) ?? []);
      if (body.pagination) setPagination(body.pagination as Pagination);
      if (body.stats) setStats(body.stats as ShipmentStats);
    } catch (err) {
      setLoadError(true);
      toast.error(err instanceof Error ? err.message : 'Failed to load shipments');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const status = sp.get('status');
    const q = (sp.get('q') ?? sp.get('search'))?.trim() ?? '';
    if (status && (STATUS_FILTERS as readonly string[]).includes(status)) setStatusFilter(status as StatusFilter);
    setSearch(q);
    setSearchInput(q);
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    fetchShipments(pagination.page, statusFilter, search);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, pagination.page, statusFilter, search]);

  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => {
      const q = searchInput.trim();
      setSearch((prev) => (prev === q ? prev : q));
      setPagination((p) => (p.page === 1 ? p : { ...p, page: 1 }));
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput, ready]);

  const openEdit = (row: ShipmentRow) => {
    const s = row.shipment;
    setForm({
      status: s.status,
      method: s.method,
      carrier: s.carrier ?? '',
      trackingNumber: s.trackingNumber ?? '',
      trackingUrl: s.trackingUrl ?? '',
      internalNotes: s.internalNotes ?? '',
      weightLbs: s.weightLbs?.toString() ?? '',
      weightOz: s.weightOz?.toString() ?? '',
      lengthIn: s.lengthIn?.toString() ?? '',
      widthIn: s.widthIn?.toString() ?? '',
      heightIn: s.heightIn?.toString() ?? '',
      from: {
        name: s.fromName, phone: s.fromPhone ?? '', email: s.fromEmail ?? '',
        street: s.fromStreet ?? '', street2: s.fromStreet2 ?? '', city: s.fromCity ?? '',
        state: s.fromState ?? '', zip: s.fromZip ?? '', country: s.fromCountry,
      },
      to: {
        name: s.toName, phone: s.toPhone ?? '', email: s.toEmail ?? '',
        street: s.toStreet ?? '', street2: s.toStreet2 ?? '', city: s.toCity ?? '',
        state: s.toState ?? '', zip: s.toZip ?? '', country: s.toCountry,
      },
    });
    setSaveError(null);
    setEditing(row);
  };

  const save = async () => {
    if (!editing || !form) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch('/api/admin/shipments', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editing.shipment.id,
          status: form.status,
          method: form.method,
          carrier: form.carrier || null,
          trackingNumber: form.trackingNumber,
          trackingUrl: form.trackingUrl.trim(),
          internalNotes: form.internalNotes,
          internalNotesBase: editing.shipment.internalNotes ?? '',
          weightLbs: intOrNull(form.weightLbs),
          weightOz: intOrNull(form.weightOz),
          lengthIn: intOrNull(form.lengthIn),
          widthIn: intOrNull(form.widthIn),
          heightIn: intOrNull(form.heightIn),
          from: form.from,
          to: form.to,
        }),
      });
      const body = await readBody(res);
      if (!res.ok) {
        setSaveError(errorMessage(res, body, 'Failed to update shipment'));
        return;
      }
      setEditing(null);
      toast.success('Shipment updated');
      if (body?.buyerNotified) toast.info(`Buyer emailed tracking for ${editing.lot.title}`);
      fetchShipments(pagination.page, statusFilter, search, true);
    } catch {
      setSaveError('Network error');
    } finally {
      setSaving(false);
    }
  };

  const allowedStatuses: ShipmentStatus[] = editing
    ? [editing.shipment.status, ...SHIPMENT_TRANSITIONS[editing.shipment.status]]
    : [];

  const setAddress = (side: 'from' | 'to', key: keyof AddressForm, value: string) =>
    setForm((f) => (f ? { ...f, [side]: { ...f[side], [key]: value } } : f));

  const addressFields = (side: 'from' | 'to', a: AddressForm) => (
    <div className="grid grid-cols-2 gap-2">
      <Input placeholder="Name" value={a.name} onChange={(e) => setAddress(side, 'name', e.target.value)} />
      <Input placeholder="Phone" value={a.phone} onChange={(e) => setAddress(side, 'phone', e.target.value)} />
      <Input className="col-span-2" placeholder="Email" value={a.email} onChange={(e) => setAddress(side, 'email', e.target.value)} />
      <Input className="col-span-2" placeholder="Street" value={a.street} onChange={(e) => setAddress(side, 'street', e.target.value)} />
      <Input className="col-span-2" placeholder="Apt / suite" value={a.street2} onChange={(e) => setAddress(side, 'street2', e.target.value)} />
      <Input placeholder="City" value={a.city} onChange={(e) => setAddress(side, 'city', e.target.value)} />
      <Input placeholder="State" value={a.state} onChange={(e) => setAddress(side, 'state', e.target.value)} />
      <Input placeholder="ZIP" value={a.zip} onChange={(e) => setAddress(side, 'zip', e.target.value)} />
      <Input placeholder="Country (US)" maxLength={2} value={a.country} onChange={(e) => setAddress(side, 'country', e.target.value.toUpperCase())} />
    </div>
  );

  return (
    <div>
      <PageHeader title="Shipments" description={`${pagination.total} matching`}>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <Stat dot="bg-yellow-500" n={stats.pending} label="pending" />
          <Stat dot="bg-red-500" n={stats.needsAddress} label="need address" />
          <Stat dot="bg-blue-500" n={stats.inTransit} label="in transit" />
          <Stat dot="bg-green-500" n={stats.delivered} label="delivered" />
          <Stat dot="bg-orange-500" n={stats.exception} label="exception / returned" />
          <Stat dot="bg-gray-400" n={stats.cancelled} label="cancelled" />
        </div>
      </PageHeader>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        {STATUS_FILTERS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => { setStatusFilter(s); setPagination((p) => ({ ...p, page: 1 })); }}
            className={`text-xs px-3 py-1.5 rounded-md border transition-colors ${
              statusFilter === s
                ? 'bg-foreground text-background border-foreground'
                : 'border-border/50 hover:bg-accent/10'
            }`}
          >
            {FILTER_LABELS[s]}
          </button>
        ))}
        <div className="relative min-w-[220px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Tracking #, buyer, lot, invoice #"
            className="h-8 pl-8 text-xs"
          />
        </div>
      </div>

      {loading && (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-16 bg-muted/30 rounded animate-pulse" />)}
        </div>
      )}

      {!loading && loadError && (
        <div className="text-center py-16 text-muted-foreground">
          <Package className="h-12 w-12 mx-auto mb-4 opacity-30" />
          <p>Failed to load shipments.</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => fetchShipments(pagination.page, statusFilter, search)}>
            Retry
          </Button>
        </div>
      )}

      {!loading && !loadError && shipments.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <Package className="h-12 w-12 mx-auto mb-4 opacity-30" />
          <p>
            {statusFilter === 'all' && !search
              ? 'No shipments yet. They appear here after buyers pay invoices.'
              : 'No shipments match these filters.'}
          </p>
        </div>
      )}

      {!loading && shipments.length > 0 && (
        <div className="border border-border/50 rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/20 border-b border-border/50">
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-left px-4 py-3 font-medium">Lot</th>
                <th className="text-left px-4 py-3 font-medium">Invoice</th>
                <th className="text-left px-4 py-3 font-medium">Buyer</th>
                <th className="text-left px-4 py-3 font-medium">Seller</th>
                <th className="text-left px-4 py-3 font-medium">Method</th>
                <th className="text-left px-4 py-3 font-medium">Tracking</th>
                <th className="text-right px-4 py-3 font-medium">Cost</th>
                <th className="text-left px-4 py-3 font-medium">Created</th>
                <th className="text-left px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {shipments.map((row) => {
                const { shipment, seller, buyer, lot, invoice } = row;
                return (
                  <tr key={shipment.id} className="border-b border-border/30 hover:bg-muted/10 align-top">
                    <td className="px-4 py-3">
                      <Badge variant={statusColors[shipment.status] || 'outline'}>{label(shipment.status)}</Badge>
                      {shipment.deliveredAt && (
                        <div className="text-[11px] text-muted-foreground mt-1">{new Date(shipment.deliveredAt).toLocaleDateString()}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/admin/lots/${lot.id}`} className="block max-w-[200px] truncate hover:underline" title={lot.title}>
                        {lot.lotNumber != null && <span className="text-muted-foreground mr-1">#{lot.lotNumber}</span>}
                        {lot.title}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/admin/invoices?q=${encodeURIComponent(invoice.invoiceNumber)}`} className="font-mono text-xs hover:underline">
                        {invoice.invoiceNumber}
                      </Link>
                      <div className="text-[11px] text-muted-foreground">{invoice.status}</div>
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/admin/users/${buyer.id}`} className="font-medium hover:underline">
                        {buyer.fullName || shipment.toName || 'Unknown'}
                      </Link>
                      <div className="text-xs text-muted-foreground">{buyer.email}</div>
                      <div className="text-[11px] text-muted-foreground max-w-[200px] truncate" title={addressLine({ street: shipment.toStreet, city: shipment.toCity, state: shipment.toState, zip: shipment.toZip })}>
                        {addressLine({ street: shipment.toStreet, city: shipment.toCity, state: shipment.toState, zip: shipment.toZip })}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/admin/users/${seller.id}`} className="hover:underline">
                        {seller.fullName || 'Unknown'}
                      </Link>
                      <div className="text-xs text-muted-foreground">{seller.email}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="capitalize">{label(shipment.method)}</span>
                      {shipment.carrier && (
                        <div className="text-xs text-muted-foreground">{shipment.carrier.toUpperCase()}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {shipment.trackingNumber ? (
                        <div className="flex items-center gap-1.5">
                          {shipment.trackingUrl ? (
                            <a href={shipment.trackingUrl} target="_blank" rel="noopener noreferrer" className="font-mono text-xs hover:underline inline-flex items-center gap-1">
                              {shipment.trackingNumber}
                              <ExternalLink className="h-3 w-3 text-champagne" />
                            </a>
                          ) : (
                            <span className="font-mono text-xs">{shipment.trackingNumber}</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                      {shipment.buyerNotifiedAt && <div className="text-[11px] text-green-700">buyer notified</div>}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatCurrencyWithCents(shipment.shippingCost + shipment.insuranceCost)}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                      {new Date(shipment.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => openEdit(row)}>
                        Update
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm">
          <p className="text-muted-foreground">
            Page {pagination.page} of {pagination.totalPages}
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={pagination.page <= 1}
              onClick={() => setPagination((p) => ({ ...p, page: p.page - 1 }))} className="gap-1">
              <ChevronLeft className="h-3.5 w-3.5" /> Prev
            </Button>
            <Button size="sm" variant="outline" disabled={pagination.page >= pagination.totalPages}
              onClick={() => setPagination((p) => ({ ...p, page: p.page + 1 }))} className="gap-1">
              Next <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Update shipment</DialogTitle>
            {editing && (
              <DialogDescription>
                {editing.lot.title} · {editing.invoice.invoiceNumber} · to {editing.buyer.fullName || editing.buyer.email}
              </DialogDescription>
            )}
          </DialogHeader>
          {form && editing && (
            <div className="space-y-5 py-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Status</Label>
                  <Select value={form.status} onValueChange={(v) => setForm((f) => (f ? { ...f, status: v as ShipmentStatus } : f))}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {allowedStatuses.map((s) => (
                        <SelectItem key={s} value={s}>{label(s)}{s === editing.shipment.status ? ' (current)' : ''}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {allowedStatuses.length === 1 && (
                    <p className="text-[11px] text-muted-foreground">This status is terminal.</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label>Method</Label>
                  <Select value={form.method} onValueChange={(v) => setForm((f) => (f ? { ...f, method: v } : f))}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {METHODS.map((m) => <SelectItem key={m} value={m}>{label(m)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Carrier</Label>
                  <Select value={form.carrier || 'none'} onValueChange={(v) => setForm((f) => (f ? { ...f, carrier: v === 'none' ? '' : v } : f))}>
                    <SelectTrigger className="w-full"><SelectValue placeholder="Select carrier" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">—</SelectItem>
                      {CARRIERS.map((c) => <SelectItem key={c} value={c}>{c.toUpperCase()}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="trackingNumber">Tracking number</Label>
                  <Input
                    id="trackingNumber"
                    value={form.trackingNumber}
                    onChange={(e) => setForm((f) => (f ? { ...f, trackingNumber: e.target.value } : f))}
                    placeholder="e.g. 1Z999AA10123456784"
                  />
                </div>
                <div className="space-y-1.5 col-span-2">
                  <Label htmlFor="trackingUrl">Tracking URL</Label>
                  <Input
                    id="trackingUrl"
                    value={form.trackingUrl}
                    onChange={(e) => setForm((f) => (f ? { ...f, trackingUrl: e.target.value } : f))}
                    placeholder="https://..."
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Parcel (in / lb / oz)</Label>
                <div className="grid grid-cols-5 gap-2">
                  <Input placeholder="L" inputMode="numeric" value={form.lengthIn} onChange={(e) => setForm((f) => (f ? { ...f, lengthIn: e.target.value } : f))} />
                  <Input placeholder="W" inputMode="numeric" value={form.widthIn} onChange={(e) => setForm((f) => (f ? { ...f, widthIn: e.target.value } : f))} />
                  <Input placeholder="H" inputMode="numeric" value={form.heightIn} onChange={(e) => setForm((f) => (f ? { ...f, heightIn: e.target.value } : f))} />
                  <Input placeholder="lb" inputMode="numeric" value={form.weightLbs} onChange={(e) => setForm((f) => (f ? { ...f, weightLbs: e.target.value } : f))} />
                  <Input placeholder="oz" inputMode="numeric" value={form.weightOz} onChange={(e) => setForm((f) => (f ? { ...f, weightOz: e.target.value } : f))} />
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Ship from (seller)</Label>
                  {addressFields('from', form.from)}
                </div>
                <div className="space-y-1.5">
                  <Label>Ship to (buyer)</Label>
                  {addressFields('to', form.to)}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="internalNotes">Internal notes {form.status === 'exception' && <span className="text-destructive">(required for exceptions)</span>}</Label>
                <Textarea
                  id="internalNotes"
                  rows={3}
                  value={form.internalNotes}
                  onChange={(e) => setForm((f) => (f ? { ...f, internalNotes: e.target.value } : f))}
                />
              </div>
              {saveError && <p className="text-sm text-destructive">{saveError}</p>}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setEditing(null)} disabled={saving}>
              Cancel
            </Button>
            <Button size="sm" disabled={saving} onClick={save}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Stat({ dot, n, label: text }: { dot: string; n: number; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`h-2 w-2 rounded-full ${dot}`} />
      {n} {text}
    </span>
  );
}
