'use client';

import { useRef, useState } from 'react';
import { track } from '@vercel/analytics';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Camera, CheckCircle, Sparkles, X } from 'lucide-react';
import { compressImage, uploadPhotosDirect, MAX_PHOTOS, MAX_FILE_SIZE } from '@/lib/upload/direct-upload';

interface PhotoItem {
  file: File;
  preview: string;
}

interface EstimateResult {
  estimateLow: number;
  estimateHigh: number;
  confidence: 'low' | 'medium' | 'high';
  summary: string;
}

function formatUsd(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (ev) => resolve(ev.target?.result as string);
    reader.onerror = () => resolve('');
    reader.readAsDataURL(file);
  });
}

interface Props {
  /** Microsite slug — attributes the lead to this city in the prospects funnel. */
  site: string;
  city: string;
}

export function CityConsignForm({ site, city }: Props) {
  const [form, setForm] = useState({ name: '', email: '', phone: '', items: '' });
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [estimate, setEstimate] = useState<EstimateResult | null>(null);
  const [stage, setStage] = useState<'uploading' | 'analyzing' | 'submitting' | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const imageFiles = files.filter(
      (f) => f.type.startsWith('image/') || f.name.toLowerCase().endsWith('.heic'),
    );
    if (imageFiles.length < files.length) {
      toast.error('Some files were skipped — only photos can be uploaded.');
    }
    if (photos.length + imageFiles.length > MAX_PHOTOS) {
      toast.error(`Maximum ${MAX_PHOTOS} photos.`);
      return;
    }
    const compressed = await Promise.all(imageFiles.map((f) => compressImage(f)));
    const sized = compressed.filter((f) => f.size <= MAX_FILE_SIZE);
    if (sized.length < compressed.length) {
      toast.error('Some photos were over 15MB and were skipped.');
    }
    const next = await Promise.all(
      sized.map(async (file) => ({ file, preview: await readFileAsDataUrl(file) })),
    );
    setPhotos((prev) => [...prev, ...next]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removePhoto = (index: number) => setPhotos((prev) => prev.filter((_, i) => i !== index));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      let photoPaths: string[] = [];
      if (photos.length > 0) {
        setStage('uploading');
        const { paths, failed } = await uploadPhotosDirect(photos.map((p) => p.file));
        photoPaths = paths;
        if (failed > 0 && paths.length === 0) {
          toast.error('Photo upload failed. Please try again.');
          return;
        }
        if (failed > 0) {
          toast.error(`${failed} photo${failed !== 1 ? 's' : ''} failed to upload — continuing with the rest.`);
        }
      }

      setStage(photoPaths.length > 0 ? 'analyzing' : 'submitting');
      const res = await fetch('/api/appraisal-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, photoPaths, site }),
      });

      if (res.ok) {
        const body = await res.json().catch(() => null);
        setEstimate(body?.data?.estimate ?? null);
        setSubmitted(true);
        // Per-site conversion counter — the whole point of the domain test.
        track('microsite_lead', { site, photos: photoPaths.length });
      } else if (res.status === 429) {
        toast.error('Too many requests. Please try again later, or call us.');
      } else {
        toast.error('Failed to submit. Please try again, or call us.');
      }
    } catch {
      toast.error('Network error. Please try again.');
    } finally {
      setSubmitting(false);
      setStage(null);
    }
  };

  if (submitted) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 sm:p-8">
        {estimate ? (
          <>
            <div className="mb-4 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-muted-foreground" />
              <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                Preliminary estimate
              </span>
            </div>
            <p className="font-display text-3xl tabular-nums tracking-tight">
              {estimate.estimateLow === estimate.estimateHigh
                ? formatUsd(estimate.estimateLow)
                : `${formatUsd(estimate.estimateLow)} – ${formatUsd(estimate.estimateHigh)}`}
            </p>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{estimate.summary}</p>
            <p className="mt-5 border-t border-border pt-4 text-[13px] leading-relaxed text-muted-foreground">
              This is an automated first pass, not an appraisal. A specialist will confirm it and call you.
            </p>
          </>
        ) : (
          <div className="flex items-start gap-3">
            <CheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-foreground" />
            <div>
              <p className="font-display text-xl tracking-tight">Request received</p>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                A specialist will call you about your {city} estate. If it is urgent — a closing date, a
                clearance deadline — call us directly and say so.
              </p>
            </div>
          </div>
        )}
      </div>
    );
  }

  const stageLabel =
    stage === 'uploading' ? 'Uploading photos…'
    : stage === 'analyzing' ? 'Reviewing photos…'
    : stage === 'submitting' ? 'Sending…'
    : null;

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-border bg-card p-6 sm:p-8">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-1">
          <label htmlFor="ms-name" className="mb-1.5 block text-[13px] font-medium">
            Name
          </label>
          <input
            id="ms-name"
            required
            maxLength={200}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <div className="sm:col-span-1">
          <label htmlFor="ms-phone" className="mb-1.5 block text-[13px] font-medium">
            Phone
          </label>
          <input
            id="ms-phone"
            required
            type="tel"
            maxLength={50}
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="ms-email" className="mb-1.5 block text-[13px] font-medium">
            Email <span className="font-normal text-muted-foreground">(optional)</span>
          </label>
          <input
            id="ms-email"
            type="email"
            maxLength={320}
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="ms-items" className="mb-1.5 block text-[13px] font-medium">
            What is there?
          </label>
          <textarea
            id="ms-items"
            rows={3}
            maxLength={5000}
            placeholder={`A house in ${city}, a single piece, a collection — and any deadline we should know about.`}
            value={form.items}
            onChange={(e) => setForm({ ...form, items: e.target.value })}
            className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground/70 focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
      </div>

      {photos.length > 0 && (
        <ul className="mt-4 flex flex-wrap gap-2">
          {photos.map((p, i) => (
            <li key={i} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.preview}
                alt=""
                className="h-16 w-16 rounded-md border border-border object-cover"
              />
              <button
                type="button"
                onClick={() => removePhoto(i)}
                aria-label={`Remove photo ${i + 1}`}
                className="absolute -right-1.5 -top-1.5 rounded-full border border-border bg-background p-0.5 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,.heic,.heif"
          multiple
          onChange={handlePhotoSelect}
          className="hidden"
          id="ms-photos"
        />
        <Button
          type="button"
          variant="outline"
          onClick={() => fileInputRef.current?.click()}
          disabled={submitting}
        >
          <Camera className="mr-2 h-4 w-4" />
          Add photos
        </Button>
        <Button type="submit" disabled={submitting}>
          {stageLabel ?? 'Request a free appraisal'}
        </Button>
      </div>

      <p className="mt-4 text-[12px] leading-relaxed text-muted-foreground">
        Photos get you a faster and far more accurate answer. Up to {MAX_PHOTOS}.
      </p>
    </form>
  );
}
