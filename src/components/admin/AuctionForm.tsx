'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export interface AuctionFormData {
  title: string;
  subtitle: string;
  saleNumber: string;
  description: string;
  slug: string;
  liveauctioneersUrl: string;
  type: 'timed' | 'live';
  previewStartsAt: string;
  biddingStartsAt: string;
  biddingEndsAt: string;
  buyerPremiumPercent: number | '';
  antiSnipeEnabled: boolean;
  antiSnipeMinutes: number | '';
  antiSnipeWindowMinutes: number | '';
  lotClosingIntervalSeconds: number | '';
  isFeatured: boolean;
}

interface AuctionFormProps {
  initialData?: AuctionFormData;
  /** Locks the schedule + type once bidding has opened (changing them mid-sale is handled separately). */
  locked?: boolean;
  onSubmit: (data: Record<string, unknown>) => Promise<void>;
  isLoading: boolean;
  submitLabel: string;
  cancelHref: string;
}

export const defaultAuctionFormData: AuctionFormData = {
  title: '',
  subtitle: '',
  saleNumber: '',
  description: '',
  slug: '',
  liveauctioneersUrl: '',
  type: 'timed',
  previewStartsAt: '',
  biddingStartsAt: '',
  biddingEndsAt: '',
  buyerPremiumPercent: 25,
  antiSnipeEnabled: true,
  antiSnipeMinutes: 2,
  antiSnipeWindowMinutes: 5,
  lotClosingIntervalSeconds: 30,
  isFeatured: false,
};

function generateSlug(title: string) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

// datetime-local inputs produce "YYYY-MM-DDTHH:mm" (local time, no zone);
// the API expects full ISO datetimes, so convert before sending.
function toIsoOrUndefined(value: string) {
  return value ? new Date(value).toISOString() : undefined;
}

function intOrUndefined(value: number | '') {
  return value === '' ? undefined : value;
}

function parseIntField(raw: string): number | '' {
  if (raw === '') return '';
  const n = parseInt(raw, 10);
  return Number.isNaN(n) ? '' : n;
}

export function AuctionForm({ initialData, locked = false, onSubmit, isLoading, submitLabel, cancelHref }: AuctionFormProps) {
  const [form, setForm] = useState<AuctionFormData>(initialData || defaultAuctionFormData);
  const [error, setError] = useState('');
  const timeZone = typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : '';

  function update<K extends keyof AuctionFormData>(field: K, value: AuctionFormData[K]) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (form.type === 'timed' && form.biddingStartsAt && form.biddingEndsAt && new Date(form.biddingEndsAt) <= new Date(form.biddingStartsAt)) {
      setError('Bidding must close after it opens.');
      return;
    }
    if (form.previewStartsAt && form.biddingStartsAt && new Date(form.previewStartsAt) > new Date(form.biddingStartsAt)) {
      setError('Preview must open before bidding opens.');
      return;
    }

    try {
      const slug = form.slug || generateSlug(form.title);
      await onSubmit({
        title: form.title,
        subtitle: form.subtitle,
        saleNumber: form.saleNumber || undefined,
        description: form.description,
        slug,
        liveauctioneersUrl: form.liveauctioneersUrl || undefined,
        type: form.type,
        previewStartsAt: toIsoOrUndefined(form.previewStartsAt),
        biddingStartsAt: toIsoOrUndefined(form.biddingStartsAt),
        biddingEndsAt: toIsoOrUndefined(form.biddingEndsAt),
        buyerPremiumPercent: intOrUndefined(form.buyerPremiumPercent),
        antiSnipeEnabled: form.antiSnipeEnabled,
        antiSnipeMinutes: intOrUndefined(form.antiSnipeMinutes),
        antiSnipeWindowMinutes: intOrUndefined(form.antiSnipeWindowMinutes),
        lotClosingIntervalSeconds: intOrUndefined(form.lotClosingIntervalSeconds),
        isFeatured: form.isFeatured,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md">{error}</div>
      )}

      <Card>
        <CardHeader><CardTitle>Sale Details</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_160px] gap-4">
            <div className="space-y-2">
              <Label htmlFor="auction-title">Title *</Label>
              <Input
                id="auction-title"
                value={form.title}
                onChange={(e) => {
                  update('title', e.target.value);
                  if (!initialData) update('slug', generateSlug(e.target.value));
                }}
                required
                placeholder="e.g., Contemporary Art Evening Sale"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="auction-sale-number">Sale number</Label>
              <Input
                id="auction-sale-number"
                value={form.saleNumber}
                onChange={(e) => update('saleNumber', e.target.value)}
                placeholder="e.g., 2026-04"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="auction-subtitle">Subtitle</Label>
            <Input id="auction-subtitle" value={form.subtitle} onChange={(e) => update('subtitle', e.target.value)} placeholder="e.g., Featuring works from the Smith Collection" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="auction-slug">URL slug</Label>
            <Input id="auction-slug" value={form.slug} onChange={(e) => update('slug', e.target.value)} placeholder="auto-generated-from-title" />
            <p className="text-xs text-muted-foreground">Public page: /auctions/{form.slug || generateSlug(form.title) || '…'}</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="auction-description">Description</Label>
            <Textarea id="auction-description" value={form.description} onChange={(e) => update('description', e.target.value)} rows={4} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Format</Label>
              <Select value={form.type} onValueChange={(v) => update('type', v as 'timed' | 'live')} disabled={locked}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="timed">Timed online (staggered close)</SelectItem>
                  <SelectItem value="live">Live (auctioneer-led, video)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {form.type === 'live'
                  ? 'Started and ended from the Live Auctions console. A close time is optional.'
                  : 'Opens and settles automatically on the schedule below.'}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="auction-la-url">LiveAuctioneers catalog URL</Label>
              <Input id="auction-la-url" value={form.liveauctioneersUrl} onChange={(e) => update('liveauctioneersUrl', e.target.value)} placeholder="https://www.liveauctioneers.com/catalog/..." />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={form.isFeatured} onCheckedChange={(v) => update('isFeatured', v === true)} />
            Feature this sale on the homepage
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Schedule</CardTitle>
          <p className="text-xs text-muted-foreground">
            Times are entered in your local time zone{timeZone ? ` (${timeZone})` : ''}.
            {locked && ' Bidding has opened — changing the close time re-schedules every open lot.'}
          </p>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="auction-preview">Preview opens</Label>
            <Input id="auction-preview" type="datetime-local" value={form.previewStartsAt} onChange={(e) => update('previewStartsAt', e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="auction-opens">Bidding opens</Label>
            <Input id="auction-opens" type="datetime-local" value={form.biddingStartsAt} onChange={(e) => update('biddingStartsAt', e.target.value)} disabled={locked} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="auction-closes">Bidding closes{form.type === 'timed' ? ' *' : ''}</Label>
            <Input id="auction-closes" type="datetime-local" value={form.biddingEndsAt} onChange={(e) => update('biddingEndsAt', e.target.value)} required={form.type === 'timed'} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Bidding Rules</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="auction-premium">Buyer&apos;s premium (%)</Label>
              <Input id="auction-premium" type="number" value={form.buyerPremiumPercent} onChange={(e) => update('buyerPremiumPercent', parseIntField(e.target.value))} min={0} max={50} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="auction-interval">Seconds between lot closes</Label>
              <Input id="auction-interval" type="number" value={form.lotClosingIntervalSeconds} onChange={(e) => update('lotClosingIntervalSeconds', parseIntField(e.target.value))} min={0} max={3600} />
              <p className="text-xs text-muted-foreground">0 closes every lot at the same moment.</p>
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={form.antiSnipeEnabled} onCheckedChange={(v) => update('antiSnipeEnabled', v === true)} />
            Anti-sniping: extend a lot when a bid lands near its close
          </label>
          {form.antiSnipeEnabled && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="auction-snipe-window">Trigger window (last N minutes)</Label>
                <Input id="auction-snipe-window" type="number" value={form.antiSnipeWindowMinutes} onChange={(e) => update('antiSnipeWindowMinutes', parseIntField(e.target.value))} min={1} max={15} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="auction-snipe-extend">Extend by (minutes)</Label>
                <Input id="auction-snipe-extend" type="number" value={form.antiSnipeMinutes} onChange={(e) => update('antiSnipeMinutes', parseIntField(e.target.value))} min={1} max={10} />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end gap-3">
        <Button variant="outline" type="button" asChild>
          <Link href={cancelHref}>Cancel</Link>
        </Button>
        <Button type="submit" disabled={isLoading}>
          {isLoading ? 'Saving...' : submitLabel}
        </Button>
      </div>
    </form>
  );
}
