'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Upload, X, Star } from 'lucide-react';
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

export interface LotFormData {
  title: string;
  subtitle: string;
  description: string;
  categoryId: string;
  saleType: 'auction' | 'gallery' | 'private';
  artist: string;
  maker: string;
  period: string;
  circa: string;
  origin: string;
  medium: string;
  dimensions: string;
  weight: string;
  condition: string;
  conditionNotes: string;
  provenance: string;
  estimateLow: string;
  estimateHigh: string;
  reservePrice: string;
  startingBid: string;
  buyNowPrice: string;
}

interface ImageItem {
  id?: string;
  url: string;
  isPrimary: boolean;
}

interface LotFormProps {
  initialData?: LotFormData;
  initialImages?: ImageItem[];
  lotId?: string;
  onSubmit: (data: Record<string, unknown>) => Promise<void>;
  isLoading: boolean;
  submitLabel: string;
  cancelHref: string;
}

const defaultFormData: LotFormData = {
  title: '',
  subtitle: '',
  description: '',
  categoryId: '',
  saleType: 'auction',
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
  buyNowPrice: '',
};

export function LotForm({ initialData, initialImages, lotId, onSubmit, isLoading, submitLabel, cancelHref }: LotFormProps) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [form, setForm] = useState<LotFormData>(initialData || defaultFormData);
  const [images, setImages] = useState<ImageItem[]>(initialImages || []);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/categories')
      .then((r) => r.json())
      .then((d) => setCategories(d.data || []));
  }, []);

  function update(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files?.length) return;
    setUploading(true);

    for (const file of Array.from(files)) {
      const formData = new FormData();
      formData.append('file', file);
      try {
        const res = await fetch('/api/upload', { method: 'POST', body: formData });
        const data = await res.json();
        if (!res.ok) continue;

        const isPrimary = images.length === 0;
        const newImage: ImageItem = { url: data.url, isPrimary };

        if (lotId) {
          const imgRes = await fetch(`/api/lots/${lotId}/images`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: data.url, isPrimary, sortOrder: images.length }),
          });
          const imgData = await imgRes.json();
          if (imgRes.ok) {
            newImage.id = imgData.data.id;
          }
        }
        setImages((prev) => [...prev, newImage]);
      } catch {
        // skip failed uploads
      }
    }
    setUploading(false);
    e.target.value = '';
  }

  async function removeImage(idx: number) {
    const img = images[idx];
    if (img.id && lotId) {
      await fetch(`/api/lots/${lotId}/images`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageId: img.id }),
      });
    }
    setImages((prev) => prev.filter((_, i) => i !== idx));
  }

  async function setPrimary(idx: number) {
    setImages((prev) => prev.map((img, i) => ({ ...img, isPrimary: i === idx })));
    const img = images[idx];
    if (lotId && img.url) {
      await fetch(`/api/lots/${lotId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ primaryImageUrl: img.url }),
      });
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await onSubmit({
        ...form,
        estimateLow: form.estimateLow ? Math.round(parseFloat(form.estimateLow) * 100) : undefined,
        estimateHigh: form.estimateHigh ? Math.round(parseFloat(form.estimateHigh) * 100) : undefined,
        reservePrice: form.reservePrice ? Math.round(parseFloat(form.reservePrice) * 100) : undefined,
        startingBid: form.startingBid ? Math.round(parseFloat(form.startingBid) * 100) : undefined,
        buyNowPrice: form.buyNowPrice ? Math.round(parseFloat(form.buyNowPrice) * 100) : undefined,
        condition: form.condition || undefined,
        primaryImageUrl: images.find((i) => i.isPrimary)?.url || images[0]?.url || undefined,
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
        <CardHeader><CardTitle>Basic Information</CardTitle></CardHeader>
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
        <CardHeader><CardTitle>Images</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {images.map((img, idx) => (
              <div key={idx} className="relative group aspect-square rounded-md overflow-hidden border">
                <img src={img.url} alt="" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                  <button type="button" onClick={() => setPrimary(idx)} className="p-1.5 rounded-full bg-white/90 hover:bg-white" title="Set as primary">
                    <Star className={`h-4 w-4 ${img.isPrimary ? 'fill-yellow-500 text-yellow-500' : 'text-gray-600'}`} />
                  </button>
                  <button type="button" onClick={() => removeImage(idx)} className="p-1.5 rounded-full bg-white/90 hover:bg-white" title="Remove">
                    <X className="h-4 w-4 text-red-600" />
                  </button>
                </div>
                {img.isPrimary && (
                  <span className="absolute top-1 left-1 text-[10px] bg-yellow-500 text-white px-1.5 py-0.5 rounded font-medium">Primary</span>
                )}
              </div>
            ))}
            <label className="aspect-square rounded-md border-2 border-dashed border-muted-foreground/25 flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-muted-foreground/50 transition-colors">
              <Upload className="h-6 w-6 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">{uploading ? 'Uploading...' : 'Add image'}</span>
              <input type="file" accept="image/*" multiple onChange={handleImageUpload} className="sr-only" disabled={uploading} />
            </label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Sale Type</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>How will this lot be sold? *</Label>
            <Select value={form.saleType} onValueChange={(v) => update('saleType', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="auction">Auction</SelectItem>
                <SelectItem value="gallery">Gallery (Buy Now)</SelectItem>
                <SelectItem value="private">Private Sale (Inquire)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {form.saleType === 'gallery' && (
            <div className="space-y-2">
              <Label>Buy Now Price (USD) *</Label>
              <Input type="number" value={form.buyNowPrice} onChange={(e) => update('buyNowPrice', e.target.value)} placeholder="$" required />
            </div>
          )}
          {form.saleType === 'private' && (
            <p className="text-sm text-muted-foreground">Price will not be shown publicly. Interested buyers will submit an inquiry.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Attribution</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <div className="space-y-2"><Label>Artist</Label><Input value={form.artist} onChange={(e) => update('artist', e.target.value)} /></div>
          <div className="space-y-2"><Label>Maker</Label><Input value={form.maker} onChange={(e) => update('maker', e.target.value)} /></div>
          <div className="space-y-2"><Label>Period</Label><Input value={form.period} onChange={(e) => update('period', e.target.value)} placeholder="e.g., Mid-Century Modern" /></div>
          <div className="space-y-2"><Label>Circa</Label><Input value={form.circa} onChange={(e) => update('circa', e.target.value)} placeholder="e.g., circa 1960" /></div>
          <div className="space-y-2"><Label>Origin</Label><Input value={form.origin} onChange={(e) => update('origin', e.target.value)} placeholder="e.g., France" /></div>
          <div className="space-y-2"><Label>Medium</Label><Input value={form.medium} onChange={(e) => update('medium', e.target.value)} placeholder="e.g., Oil on canvas" /></div>
          <div className="space-y-2"><Label>Dimensions</Label><Input value={form.dimensions} onChange={(e) => update('dimensions', e.target.value)} placeholder="e.g., 24 x 36 inches" /></div>
          <div className="space-y-2"><Label>Weight</Label><Input value={form.weight} onChange={(e) => update('weight', e.target.value)} /></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Condition & Provenance</CardTitle></CardHeader>
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
          <div className="space-y-2"><Label>Condition Notes</Label><Textarea value={form.conditionNotes} onChange={(e) => update('conditionNotes', e.target.value)} rows={3} /></div>
          <div className="space-y-2"><Label>Provenance</Label><Textarea value={form.provenance} onChange={(e) => update('provenance', e.target.value)} rows={3} placeholder="Ownership history" /></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Pricing (USD)</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <div className="space-y-2"><Label>Low Estimate</Label><Input type="number" value={form.estimateLow} onChange={(e) => update('estimateLow', e.target.value)} placeholder="$" /></div>
          <div className="space-y-2"><Label>High Estimate</Label><Input type="number" value={form.estimateHigh} onChange={(e) => update('estimateHigh', e.target.value)} placeholder="$" /></div>
          <div className="space-y-2"><Label>Reserve Price (hidden)</Label><Input type="number" value={form.reservePrice} onChange={(e) => update('reservePrice', e.target.value)} placeholder="$" /></div>
          <div className="space-y-2"><Label>Starting Bid</Label><Input type="number" value={form.startingBid} onChange={(e) => update('startingBid', e.target.value)} placeholder="$" /></div>
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
