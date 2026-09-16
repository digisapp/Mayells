'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Upload, X, Star, ChevronLeft, ChevronRight, Loader2, Search } from 'lucide-react';
import { toast } from 'sonner';
import type { Category } from '@/db/schema/categories';
import { ADMIN_UPLOAD_ACCEPT, uploadImageAsAdmin } from '@/lib/upload/admin-upload';

// Radix Select rejects an empty-string item value, so "no subcategory" needs
// a sentinel that is mapped back to '' in form state.
const NO_SUBCATEGORY = '__none__';

interface SubcategoryOption {
  id: string;
  name: string;
}

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
  subcategoryId: string;
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
  literature: string;
  exhibited: string;
  estimateLow: string;
  estimateHigh: string;
  reservePrice: string;
  startingBid: string;
  buyNowPrice: string;
  sellerId: string;
  isFeatured: boolean;
  isHighlight: boolean;
}

export interface SellerSummary {
  id: string;
  fullName: string | null;
  email: string;
}

interface ImageItem {
  id?: string;
  url: string;
  isPrimary: boolean;
}

interface LotFormProps {
  initialData?: LotFormData;
  initialImages?: ImageItem[];
  /** Seller-of-record already attached to the lot, so the picker can show it. */
  initialSeller?: SellerSummary | null;
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
  subcategoryId: '',
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
  literature: '',
  exhibited: '',
  estimateLow: '',
  estimateHigh: '',
  reservePrice: '',
  startingBid: '',
  buyNowPrice: '',
  sellerId: '',
  isFeatured: false,
  isHighlight: false,
};

const MONEY_FIELDS: Array<{ key: keyof LotFormData; label: string }> = [
  { key: 'estimateLow', label: 'Low estimate' },
  { key: 'estimateHigh', label: 'High estimate' },
  { key: 'reservePrice', label: 'Reserve price' },
  { key: 'startingBid', label: 'Starting bid' },
  { key: 'buyNowPrice', label: 'Buy Now price' },
];

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const data = await res.json();
    return (data && typeof data.error === 'string' && data.error) || fallback;
  } catch {
    return fallback;
  }
}

export function LotForm({
  initialData,
  initialImages,
  initialSeller,
  lotId,
  onSubmit,
  isLoading,
  submitLabel,
  cancelHref,
}: LotFormProps) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [subcategories, setSubcategories] = useState<SubcategoryOption[]>([]);
  const [subcategoriesLoading, setSubcategoriesLoading] = useState(false);
  const [form, setForm] = useState<LotFormData>(initialData || defaultFormData);
  const [images, setImages] = useState<ImageItem[]>(initialImages || []);
  const [uploading, setUploading] = useState(false);
  const [reordering, setReordering] = useState(false);
  const [error, setError] = useState('');

  // Seller picker
  const [selectedSeller, setSelectedSeller] = useState<SellerSummary | null>(initialSeller ?? null);
  const [sellerQuery, setSellerQuery] = useState('');
  const [sellerResults, setSellerResults] = useState<SellerSummary[]>([]);
  const [sellerSearching, setSellerSearching] = useState(false);

  useEffect(() => {
    fetch('/api/categories')
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || 'Failed to load departments');
        setCategories(d.data || []);
      })
      .catch((err: unknown) => {
        toast.error(err instanceof Error ? err.message : 'Failed to load departments');
      });
  }, []);

  // Subcategories follow the chosen department. Switching department drops a
  // subcategory that no longer belongs to it.
  useEffect(() => {
    const categoryId = form.categoryId;
    setSubcategories([]);
    if (!categoryId) return;
    const controller = new AbortController();
    setSubcategoriesLoading(true);
    fetch(`/api/categories/${categoryId}/subcategories`, { signal: controller.signal })
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || 'Failed to load subcategories');
        const rows = (d.data || []) as SubcategoryOption[];
        setSubcategories(rows);
        setForm((prev) =>
          prev.subcategoryId && !rows.some((s) => s.id === prev.subcategoryId)
            ? { ...prev, subcategoryId: '' }
            : prev,
        );
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        toast.error(err instanceof Error ? err.message : 'Failed to load subcategories');
      })
      .finally(() => {
        if (!controller.signal.aborted) setSubcategoriesLoading(false);
      });
    return () => controller.abort();
  }, [form.categoryId]);

  // Debounced seller search against the admin users endpoint.
  useEffect(() => {
    const q = sellerQuery.trim();
    if (q.length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setSellerSearching(true);
      try {
        const res = await fetch(`/api/admin/users?search=${encodeURIComponent(q)}`, { signal: controller.signal });
        const data = await res.json();
        if (!res.ok) {
          toast.error(data.error || 'Seller search failed');
          return;
        }
        const rows = (data.data ?? []) as Array<{ id: string; fullName: string | null; email: string }>;
        setSellerResults(rows.slice(0, 8).map((u) => ({ id: u.id, fullName: u.fullName, email: u.email })));
      } catch (err) {
        if (!(err instanceof DOMException && err.name === 'AbortError')) {
          toast.error('Seller search failed');
        }
      } finally {
        if (!controller.signal.aborted) setSellerSearching(false);
      }
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [sellerQuery]);

  const visibleSellerResults = sellerQuery.trim().length >= 2 ? sellerResults : [];

  function update<K extends keyof LotFormData>(field: K, value: LotFormData[K]) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function chooseSeller(seller: SellerSummary) {
    setSelectedSeller(seller);
    update('sellerId', seller.id);
    setSellerQuery('');
    setSellerResults([]);
  }

  function clearSeller() {
    setSelectedSeller(null);
    update('sellerId', '');
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.target;
    const files = input.files;
    if (!files?.length) return;
    setUploading(true);

    // Track the running count locally: `images` is stale inside this loop,
    // so relying on images.length would mark every uploaded image as primary.
    let imageCount = images.length;
    const failed: string[] = [];

    // Bytes go straight to storage via a signed URL (see admin-upload.ts);
    // routing them through /api/upload trips Vercel's 4.5 MB body cap on
    // phone photos. One failure must not abort the run — the rest still land.
    for (const file of Array.from(files)) {
      try {
        const { url } = await uploadImageAsAdmin(file);

        const isPrimary = imageCount === 0;
        const newImage: ImageItem = { url, isPrimary };

        if (lotId) {
          const imgRes = await fetch(`/api/lots/${lotId}/images`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url, isPrimary, sortOrder: imageCount }),
          });
          if (!imgRes.ok) {
            failed.push(`${file.name}: ${await readError(imgRes, 'could not attach image to lot')}`);
            continue;
          }
          const imgData = await imgRes.json();
          newImage.id = imgData.data.id;
        }
        setImages((prev) => [...prev, newImage]);
        imageCount++;
      } catch (err) {
        failed.push(`${file.name}: ${err instanceof Error ? err.message : 'upload failed'}`);
      }
    }
    setUploading(false);
    input.value = '';
    for (const message of failed) toast.error(message);
  }

  async function removeImage(idx: number) {
    const img = images[idx];
    if (img.id && lotId) {
      const res = await fetch(`/api/lots/${lotId}/images`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageId: img.id }),
      });
      if (!res.ok) {
        toast.error(await readError(res, 'Failed to remove image'));
        return;
      }
    }
    setImages((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      // Mirror the server: when the primary goes, the first remaining image
      // becomes primary.
      if (img.isPrimary && next.length > 0 && !next.some((n) => n.isPrimary)) {
        next[0] = { ...next[0], isPrimary: true };
      }
      return next;
    });
  }

  async function setPrimary(idx: number) {
    const img = images[idx];
    if (lotId && img.url) {
      const res = await fetch(`/api/lots/${lotId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ primaryImageUrl: img.url }),
      });
      if (!res.ok) {
        toast.error(await readError(res, 'Failed to set primary image'));
        return;
      }
    }
    setImages((prev) => prev.map((image, i) => ({ ...image, isPrimary: i === idx })));
  }

  async function moveImage(idx: number, direction: -1 | 1) {
    const target = idx + direction;
    if (target < 0 || target >= images.length || reordering) return;
    const previous = images;
    const next = [...images];
    [next[idx], next[target]] = [next[target], next[idx]];
    setImages(next);

    // Persist only for an existing lot whose images all have server ids; a new
    // lot's order is applied when the create page attaches them in sequence.
    if (!lotId || !next.every((image) => image.id)) return;
    setReordering(true);
    try {
      const res = await fetch(`/api/lots/${lotId}/images`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order: next.map((image) => image.id) }),
      });
      if (!res.ok) {
        toast.error(await readError(res, 'Failed to reorder images'));
        setImages(previous);
      }
    } catch {
      toast.error('Failed to reorder images');
      setImages(previous);
    } finally {
      setReordering(false);
    }
  }

  /**
   * Dollars → integer cents. An empty field means "clear" (null) when editing
   * an existing lot and "not set" (undefined) on create, so partial updates can
   * actually remove a value server-side.
   */
  function toCents(value: string): number | null | undefined {
    if (value.trim() === '') return lotId ? null : undefined;
    return Math.round(parseFloat(value) * 100);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    for (const { key, label } of MONEY_FIELDS) {
      const raw = String(form[key]).trim();
      if (raw === '') continue;
      const n = parseFloat(raw);
      if (!Number.isFinite(n) || n <= 0) {
        setError(`${label} must be a positive amount.`);
        return;
      }
    }
    if (form.estimateLow.trim() && form.estimateHigh.trim()) {
      if (parseFloat(form.estimateHigh) < parseFloat(form.estimateLow)) {
        setError('High estimate must be at least the low estimate.');
        return;
      }
    }

    const { isFeatured, isHighlight, sellerId, ...textFields } = form;

    try {
      await onSubmit({
        ...textFields,
        estimateLow: toCents(form.estimateLow),
        estimateHigh: toCents(form.estimateHigh),
        reservePrice: toCents(form.reservePrice),
        startingBid: toCents(form.startingBid),
        buyNowPrice: toCents(form.buyNowPrice),
        condition: form.condition || (lotId ? null : undefined),
        sellerId: sellerId || (lotId ? null : undefined),
        subcategoryId: form.subcategoryId || (lotId ? null : undefined),
        isFeatured,
        isHighlight,
        primaryImageUrl: images.find((i) => i.isPrimary)?.url || images[0]?.url || undefined,
        // On a new lot there is no id to attach uploads to yet; pass the
        // collected images so the create page can attach them after the POST.
        ...(lotId ? {} : { images: images.map(({ url, isPrimary }) => ({ url, isPrimary })) }),
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
            <Label>Department *</Label>
            <Select value={form.categoryId} onValueChange={(v) => update('categoryId', v)}>
              <SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger>
              <SelectContent>
                {categories.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {form.categoryId && (
            <div className="space-y-2">
              <Label>Subcategory</Label>
              <Select
                value={form.subcategoryId || NO_SUBCATEGORY}
                onValueChange={(v) => update('subcategoryId', v === NO_SUBCATEGORY ? '' : v)}
                disabled={subcategoriesLoading || subcategories.length === 0}
              >
                <SelectTrigger><SelectValue placeholder={subcategoriesLoading ? 'Loading…' : 'None'} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_SUBCATEGORY}>None</SelectItem>
                  {subcategories.map((sub) => (
                    <SelectItem key={sub.id} value={sub.id}>{sub.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!subcategoriesLoading && subcategories.length === 0 && (
                <p className="text-xs text-muted-foreground">This department has no subcategories.</p>
              )}
            </div>
          )}
          <div className="flex flex-wrap gap-6 pt-1">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox checked={form.isFeatured} onCheckedChange={(v) => update('isFeatured', v === true)} />
              Featured
              <span className="text-xs text-muted-foreground">(home page)</span>
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox checked={form.isHighlight} onCheckedChange={(v) => update('isHighlight', v === true)} />
              Highlight
              <span className="text-xs text-muted-foreground">(sale highlights)</span>
            </label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Seller</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {selectedSeller ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{selectedSeller.fullName || selectedSeller.email}</p>
                {selectedSeller.fullName && (
                  <p className="text-xs text-muted-foreground truncate">{selectedSeller.email}</p>
                )}
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={clearSeller} className="gap-1">
                <X className="h-3.5 w-3.5" /> Clear
              </Button>
            </div>
          ) : (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                value={sellerQuery}
                onChange={(e) => setSellerQuery(e.target.value)}
                placeholder="Search consignors by name or email"
                className="pl-9"
                autoComplete="off"
              />
              {sellerSearching && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
              )}
              {visibleSellerResults.length > 0 && (
                <ul className="absolute z-10 mt-1 w-full rounded-md border bg-popover shadow-md max-h-64 overflow-y-auto">
                  {visibleSellerResults.map((u) => (
                    <li key={u.id}>
                      <button
                        type="button"
                        onClick={() => chooseSeller(u)}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-accent"
                      >
                        <span className="font-medium">{u.fullName || u.email}</span>
                        {u.fullName && <span className="block text-xs text-muted-foreground">{u.email}</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {!sellerSearching && sellerQuery.trim().length >= 2 && visibleSellerResults.length === 0 && (
                <p className="text-xs text-muted-foreground mt-2">No matching users.</p>
              )}
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Seller-of-record for payouts. Settlement skips the payout for a lot with no seller.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Images</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {images.map((img, idx) => (
              <div key={img.url} className="relative group aspect-square rounded-md overflow-hidden border">
                {/* eslint-disable-next-line @next/next/no-img-element -- admin thumbnail / local file preview */}
                <img src={img.url} alt={`Lot image ${idx + 1}`} className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity flex items-center justify-center gap-2">
                  <button type="button" onClick={() => setPrimary(idx)} className="p-1.5 rounded-full bg-white/90 hover:bg-white" title="Set as primary">
                    <Star className={`h-4 w-4 ${img.isPrimary ? 'fill-yellow-500 text-yellow-500' : 'text-gray-600'}`} />
                  </button>
                  <button type="button" onClick={() => removeImage(idx)} className="p-1.5 rounded-full bg-white/90 hover:bg-white" title="Remove">
                    <X className="h-4 w-4 text-red-600" />
                  </button>
                </div>
                <div className="absolute bottom-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                  <button
                    type="button"
                    onClick={() => moveImage(idx, -1)}
                    disabled={idx === 0 || reordering}
                    className="p-1 rounded bg-white/90 hover:bg-white disabled:opacity-40"
                    title="Move earlier"
                    aria-label="Move image earlier"
                  >
                    <ChevronLeft className="h-3.5 w-3.5 text-gray-700" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveImage(idx, 1)}
                    disabled={idx === images.length - 1 || reordering}
                    className="p-1 rounded bg-white/90 hover:bg-white disabled:opacity-40"
                    title="Move later"
                    aria-label="Move image later"
                  >
                    <ChevronRight className="h-3.5 w-3.5 text-gray-700" />
                  </button>
                </div>
                {img.isPrimary && (
                  <span className="absolute top-1 left-1 text-[10px] bg-yellow-500 text-white px-1.5 py-0.5 rounded font-medium">Primary</span>
                )}
                <span className="absolute top-1 right-1 text-[10px] bg-black/60 text-white px-1.5 py-0.5 rounded">{idx + 1}</span>
              </div>
            ))}
            <label className="aspect-square rounded-md border-2 border-dashed border-muted-foreground/25 flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-muted-foreground/50 transition-colors">
              <Upload className="h-6 w-6 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">{uploading ? 'Uploading...' : 'Add image'}</span>
              <input type="file" accept={ADMIN_UPLOAD_ACCEPT} multiple onChange={handleImageUpload} className="sr-only" disabled={uploading} />
            </label>
          </div>
          <p className="text-xs text-muted-foreground">JPEG, PNG, WebP, AVIF, or HEIC up to 15 MB each — photos upload straight to storage, so full-size phone shots are fine.</p>
          {images.length > 1 && (
            <p className="text-xs text-muted-foreground">Hover an image to reorder it; the order here is the order shown on the site.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Sale Type</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>How will this lot be sold? *</Label>
            <Select value={form.saleType} onValueChange={(v) => update('saleType', v as LotFormData['saleType'])}>
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
              <Input type="number" min="0" step="0.01" value={form.buyNowPrice} onChange={(e) => update('buyNowPrice', e.target.value)} placeholder="$" required />
            </div>
          )}
          {form.saleType === 'private' && (
            <p className="text-sm text-muted-foreground">Price will not be shown publicly. The lot page invites buyers to email info@mayells.com; replies land in the Inbox.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Attribution</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
            {form.condition && (
              <button type="button" onClick={() => update('condition', '')} className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2">
                Clear condition
              </button>
            )}
          </div>
          <div className="space-y-2"><Label>Condition Notes</Label><Textarea value={form.conditionNotes} onChange={(e) => update('conditionNotes', e.target.value)} rows={3} /></div>
          <div className="space-y-2"><Label>Provenance</Label><Textarea value={form.provenance} onChange={(e) => update('provenance', e.target.value)} rows={3} placeholder="Ownership history" /></div>
          <div className="space-y-2"><Label>Literature</Label><Textarea value={form.literature} onChange={(e) => update('literature', e.target.value)} rows={3} placeholder="Publications in which this work is cited or illustrated" /></div>
          <div className="space-y-2"><Label>Exhibited</Label><Textarea value={form.exhibited} onChange={(e) => update('exhibited', e.target.value)} rows={3} placeholder="Exhibition history" /></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Pricing (USD)</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2"><Label>Low Estimate</Label><Input type="number" min="0" step="0.01" value={form.estimateLow} onChange={(e) => update('estimateLow', e.target.value)} placeholder="$" /></div>
          <div className="space-y-2"><Label>High Estimate</Label><Input type="number" min="0" step="0.01" value={form.estimateHigh} onChange={(e) => update('estimateHigh', e.target.value)} placeholder="$" /></div>
          <div className="space-y-2"><Label>Reserve Price (hidden)</Label><Input type="number" min="0" step="0.01" value={form.reservePrice} onChange={(e) => update('reservePrice', e.target.value)} placeholder="$" /></div>
          <div className="space-y-2"><Label>Starting Bid</Label><Input type="number" min="0" step="0.01" value={form.startingBid} onChange={(e) => update('startingBid', e.target.value)} placeholder="$" /></div>
          {lotId && (
            <p className="text-xs text-muted-foreground sm:col-span-2">Leave a field blank to clear the stored value.</p>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap justify-end gap-3">
        <Button asChild variant="outline">
          <Link href={cancelHref}>Cancel</Link>
        </Button>
        <Button type="submit" disabled={isLoading}>
          {isLoading ? 'Saving...' : submitLabel}
        </Button>
      </div>
    </form>
  );
}
