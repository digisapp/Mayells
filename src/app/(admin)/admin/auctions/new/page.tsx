'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default function NewAuctionPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    title: '',
    subtitle: '',
    description: '',
    slug: '',
    type: 'timed' as 'timed' | 'live',
    previewStartsAt: '',
    biddingStartsAt: '',
    biddingEndsAt: '',
    buyerPremiumPercent: 25,
    antiSnipeEnabled: true,
    antiSnipeMinutes: 2,
    antiSnipeWindowMinutes: 5,
  });

  function generateSlug(title: string) {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const slug = form.slug || generateSlug(form.title);
      const res = await fetch('/api/auctions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          slug,
          previewStartsAt: form.previewStartsAt || undefined,
          biddingStartsAt: form.biddingStartsAt || undefined,
          biddingEndsAt: form.biddingEndsAt || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error);
        return;
      }

      router.push('/admin/auctions');
    } catch {
      setError('Failed to create auction');
    } finally {
      setIsLoading(false);
    }
  }

  function update(field: string, value: string | number | boolean) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  return (
    <div className="max-w-3xl">
      <Link href="/admin/auctions" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6">
        <ArrowLeft className="h-4 w-4" />
        Back to Auctions
      </Link>

      <h1 className="font-display text-display-sm mb-8">Create New Auction</h1>

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
                  if (!form.slug) update('slug', generateSlug(e.target.value));
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
          <Link href="/admin/auctions">
            <Button variant="outline" type="button">Cancel</Button>
          </Link>
          <Button type="submit" disabled={isLoading}>
            {isLoading ? 'Creating...' : 'Create Auction'}
          </Button>
        </div>
      </form>
    </div>
  );
}
