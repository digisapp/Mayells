'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import type { Category } from '@/db/schema/categories';

const conditions = [
  { value: 'mint', label: 'Mint' },
  { value: 'excellent', label: 'Excellent' },
  { value: 'very_good', label: 'Very Good' },
  { value: 'good', label: 'Good' },
  { value: 'fair', label: 'Fair' },
  { value: 'poor', label: 'Poor' },
  { value: 'as_is', label: 'As Is' },
];

export default function NewLotPage() {
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    title: '',
    subtitle: '',
    description: '',
    categoryId: '',
    artist: '',
    maker: '',
    period: '',
    circa: '',
    origin: '',
    medium: '',
    dimensions: '',
    weight: '',
    condition: '',
    conditionNotes: '',
    provenance: '',
    estimateLow: '',
    estimateHigh: '',
    reservePrice: '',
    startingBid: '',
  });

  useEffect(() => {
    fetch('/api/categories')
      .then((r) => r.json())
      .then((d) => setCategories(d.data || []));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/lots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          estimateLow: form.estimateLow ? Math.round(parseFloat(form.estimateLow) * 100) : undefined,
          estimateHigh: form.estimateHigh ? Math.round(parseFloat(form.estimateHigh) * 100) : undefined,
          reservePrice: form.reservePrice ? Math.round(parseFloat(form.reservePrice) * 100) : undefined,
          startingBid: form.startingBid ? Math.round(parseFloat(form.startingBid) * 100) : undefined,
          condition: form.condition || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error);
        return;
      }

      router.push('/admin/lots');
    } catch {
      setError('Failed to create lot');
    } finally {
      setIsLoading(false);
    }
  }

  function update(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  return (
    <div className="max-w-3xl">
      <Link href="/admin/lots" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6">
        <ArrowLeft className="h-4 w-4" />
        Back to Lots
      </Link>

      <h1 className="font-display text-display-sm mb-8">Create New Lot</h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md">{error}</div>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Basic Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Title *</Label>
              <Input value={form.title} onChange={(e) => update('title', e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>Subtitle</Label>
              <Input value={form.subtitle} onChange={(e) => update('subtitle', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Description *</Label>
              <Textarea value={form.description} onChange={(e) => update('description', e.target.value)} rows={5} required />
            </div>
            <div className="space-y-2">
              <Label>Category *</Label>
              <Select value={form.categoryId} onValueChange={(v) => update('categoryId', v)}>
                <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Attribution</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Artist</Label>
              <Input value={form.artist} onChange={(e) => update('artist', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Maker</Label>
              <Input value={form.maker} onChange={(e) => update('maker', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Period</Label>
              <Input value={form.period} onChange={(e) => update('period', e.target.value)} placeholder="e.g., Mid-Century Modern" />
            </div>
            <div className="space-y-2">
              <Label>Circa</Label>
              <Input value={form.circa} onChange={(e) => update('circa', e.target.value)} placeholder="e.g., circa 1960" />
            </div>
            <div className="space-y-2">
              <Label>Origin</Label>
              <Input value={form.origin} onChange={(e) => update('origin', e.target.value)} placeholder="e.g., France" />
            </div>
            <div className="space-y-2">
              <Label>Medium</Label>
              <Input value={form.medium} onChange={(e) => update('medium', e.target.value)} placeholder="e.g., Oil on canvas" />
            </div>
            <div className="space-y-2">
              <Label>Dimensions</Label>
              <Input value={form.dimensions} onChange={(e) => update('dimensions', e.target.value)} placeholder="e.g., 24 x 36 inches" />
            </div>
            <div className="space-y-2">
              <Label>Weight</Label>
              <Input value={form.weight} onChange={(e) => update('weight', e.target.value)} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Condition & Provenance</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Condition</Label>
              <Select value={form.condition} onValueChange={(v) => update('condition', v)}>
                <SelectTrigger><SelectValue placeholder="Select condition" /></SelectTrigger>
                <SelectContent>
                  {conditions.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Condition Notes</Label>
              <Textarea value={form.conditionNotes} onChange={(e) => update('conditionNotes', e.target.value)} rows={3} />
            </div>
            <div className="space-y-2">
              <Label>Provenance</Label>
              <Textarea value={form.provenance} onChange={(e) => update('provenance', e.target.value)} rows={3} placeholder="Ownership history" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Pricing (USD)</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Low Estimate</Label>
              <Input type="number" value={form.estimateLow} onChange={(e) => update('estimateLow', e.target.value)} placeholder="$" />
            </div>
            <div className="space-y-2">
              <Label>High Estimate</Label>
              <Input type="number" value={form.estimateHigh} onChange={(e) => update('estimateHigh', e.target.value)} placeholder="$" />
            </div>
            <div className="space-y-2">
              <Label>Reserve Price (hidden)</Label>
              <Input type="number" value={form.reservePrice} onChange={(e) => update('reservePrice', e.target.value)} placeholder="$" />
            </div>
            <div className="space-y-2">
              <Label>Starting Bid</Label>
              <Input type="number" value={form.startingBid} onChange={(e) => update('startingBid', e.target.value)} placeholder="$" />
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3">
          <Link href="/admin/lots">
            <Button variant="outline" type="button">Cancel</Button>
          </Link>
          <Button type="submit" disabled={isLoading}>
            {isLoading ? 'Creating...' : 'Create Lot'}
          </Button>
        </div>
      </form>
    </div>
  );
}
