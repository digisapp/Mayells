'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export interface AuctionFormData {
  title: string;
  subtitle: string;
  description: string;
  slug: string;
  type: 'timed' | 'live';
  previewStartsAt: string;
  biddingStartsAt: string;
  biddingEndsAt: string;
  buyerPremiumPercent: number;
  antiSnipeEnabled: boolean;
  antiSnipeMinutes: number;
  antiSnipeWindowMinutes: number;
}

interface AuctionFormProps {
  initialData?: AuctionFormData;
  onSubmit: (data: Record<string, unknown>) => Promise<void>;
  isLoading: boolean;
  submitLabel: string;
  cancelHref: string;
}

const defaultFormData: AuctionFormData = {
  title: '',
  subtitle: '',
  description: '',
  slug: '',
  type: 'timed',
  previewStartsAt: '',
  biddingStartsAt: '',
  biddingEndsAt: '',
  buyerPremiumPercent: 25,
  antiSnipeEnabled: true,
  antiSnipeMinutes: 2,
  antiSnipeWindowMinutes: 5,
};

function generateSlug(title: string) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

export function AuctionForm({ initialData, onSubmit, isLoading, submitLabel, cancelHref }: AuctionFormProps) {
  const [form, setForm] = useState<AuctionFormData>(initialData || defaultFormData);
  const [error, setError] = useState('');

  function update(field: string, value: string | number | boolean) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      const slug = form.slug || generateSlug(form.title);
      await onSubmit({
        ...form,
        slug,
        previewStartsAt: form.previewStartsAt || undefined,
        biddingStartsAt: form.biddingStartsAt || undefined,
        biddingEndsAt: form.biddingEndsAt || undefined,
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
        <CardHeader><CardTitle>Auction Details</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Title *</Label>
            <Input
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
            <Label>Subtitle</Label>
            <Input value={form.subtitle} onChange={(e) => update('subtitle', e.target.value)} placeholder="e.g., Featuring works from the Smith Collection" />
          </div>
          <div className="space-y-2">
            <Label>URL Slug</Label>
            <Input value={form.slug} onChange={(e) => update('slug', e.target.value)} placeholder="auto-generated-from-title" />
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea value={form.description} onChange={(e) => update('description', e.target.value)} rows={4} />
          </div>
          <div className="space-y-2">
            <Label>Auction Type</Label>
            <Select value={form.type} onValueChange={(v) => update('type', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="timed">Timed Online</SelectItem>
                <SelectItem value="live">Live (coming soon)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Schedule</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label>Preview Opens</Label>
            <Input type="datetime-local" value={form.previewStartsAt} onChange={(e) => update('previewStartsAt', e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Bidding Opens *</Label>
            <Input type="datetime-local" value={form.biddingStartsAt} onChange={(e) => update('biddingStartsAt', e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Bidding Closes *</Label>
            <Input type="datetime-local" value={form.biddingEndsAt} onChange={(e) => update('biddingEndsAt', e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Settings</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Buyer&apos;s Premium (%)</Label>
            <Input type="number" value={form.buyerPremiumPercent} onChange={(e) => update('buyerPremiumPercent', parseInt(e.target.value))} min={0} max={50} />
          </div>
          <div className="space-y-2">
            <Label>Anti-Snipe Extension (minutes)</Label>
            <Input type="number" value={form.antiSnipeMinutes} onChange={(e) => update('antiSnipeMinutes', parseInt(e.target.value))} min={1} max={10} />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-3">
        <a href={cancelHref}>
          <Button variant="outline" type="button">Cancel</Button>
        </a>
        <Button type="submit" disabled={isLoading}>
          {isLoading ? 'Saving...' : submitLabel}
        </Button>
      </div>
    </form>
  );
}
