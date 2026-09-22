'use client';

import { useId, useRef, useState } from 'react';
import { track } from '@vercel/analytics';
import { toast } from 'sonner';
import { Camera, CheckCircle, Loader2, Sparkles, X } from 'lucide-react';
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

// text-base (16px) is load-bearing, not cosmetic: iOS Safari zooms the
// viewport when a focused input's font-size is under 16px, which on a lead
// form reads as the page breaking. h-12 keeps every control at/above the 44px
// minimum touch target — this audience skews well over 65.
const FIELD =
  'w-full rounded-lg border border-input bg-background px-3.5 text-base h-12 ' +
  'outline-none transition-shadow placeholder:text-muted-foreground/60 ' +
  'focus-visible:border-foreground focus-visible:ring-2 focus-visible:ring-foreground/15';

interface Props {
  /** Microsite slug — attributes the lead to this city in the prospects funnel. */
  site: string;
  city: string;
  /** Distinguishes the hero form from the repeat form for analytics. */
  placement: 'hero' | 'section';
}

export function CityConsignForm({ site, city, placement }: Props) {
  const uid = useId();
  const [form, setForm] = useState({ name: '', email: '', phone: '', items: '' });
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [estimate, setEstimate] = useState<EstimateResult | null>(null);
  const [stage, setStage] = useState<'uploading' | 'analyzing' | 'submitting' | null>(null);
  // Honeypot. Real visitors never see the field; bots that fill every input
  // do, and the server drops those silently. Exact-match domains attract
  // form spam, and every fake lead lands in the admin prospects funnel.
  const [hp, setHp] = useState('');
  const started = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // First interaction with any field, once per form — gives the funnel a
  // "started" step between page view and lead, so a drop-off shows up as
  // a form problem rather than a traffic problem.
  const handleFormStart = () => {
    if (started.current) return;
    started.current = true;
    track('microsite_form_start', { site, placement });
  };

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

  const removePhoto = (i: number) => setPhotos((p) => p.filter((_, idx) => idx !== i));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      // Photos are an optional attachment; the name, phone and description are
      // the lead. An upload failure must never discard them — a 429 from the
      // IP rate limit, a storage blip, or a dropped PUT on a phone inside a
      // house being cleared would otherwise lose the most engaged visitor
      // there is, with nothing written server-side to recover them from.
      let photoPaths: string[] = [];
      let photoNote = '';
      if (photos.length > 0) {
        setStage('uploading');
        try {
          const { paths, failed } = await uploadPhotosDirect(photos.map((p) => p.file));
          photoPaths = paths;
          if (failed > 0) {
            photoNote = `\n\n[${failed} of ${photos.length} photo(s) did not upload.]`;
          }
        } catch {
          photoNote = `\n\n[All ${photos.length} photo(s) failed to upload — please ask the seller to resend them.]`;
        }
      }

      setStage(photoPaths.length > 0 ? 'analyzing' : 'submitting');
      const res = await fetch('/api/appraisal-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          // Server caps `items` at 5000 chars; keep the note inside that.
          items: `${form.items}${photoNote}`.slice(0, 5000),
          photoPaths,
          site,
          hp,
        }),
      });

      if (res.ok) {
        const body = await res.json().catch(() => null);
        setEstimate(body?.data?.estimate ?? null);
        setSubmitted(true);
        track('microsite_lead', { site, placement, photos: photoPaths.length });
        // Report the photo problem only after the lead is safely captured.
        if (photoNote) {
          toast.error('Your request was sent, but the photos did not attach. We will ask for them.');
        }
      } else if (res.status === 429) {
        toast.error('Too many requests. Please call us instead.');
      } else {
        toast.error('Something went wrong. Please try again, or call us.');
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
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
        {estimate ? (
          <>
            <div className="mb-3 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-muted-foreground" />
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Preliminary estimate
              </span>
            </div>
            <p className="font-display text-4xl tabular-nums tracking-tight">
              {estimate.estimateLow === estimate.estimateHigh
                ? formatUsd(estimate.estimateLow)
                : `${formatUsd(estimate.estimateLow)} – ${formatUsd(estimate.estimateHigh)}`}
            </p>
            <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">{estimate.summary}</p>
            <p className="mt-5 border-t border-border pt-4 text-[13.5px] leading-relaxed text-muted-foreground">
              An automated first pass, not an appraisal. A specialist will confirm it and call you.
            </p>
          </>
        ) : (
          <div className="flex items-start gap-3">
            <CheckCircle className="mt-0.5 h-6 w-6 shrink-0" />
            <div>
              <p className="font-display text-2xl tracking-tight">Request received</p>
              <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
                A specialist will call you about your {city} estate. If there is a deadline, call us
                directly and say so — we will work to it.
              </p>
            </div>
          </div>
        )}
      </div>
    );
  }

  const busyLabel =
    stage === 'uploading' ? 'Uploading photos…'
    : stage === 'analyzing' ? 'Reviewing photos…'
    : stage === 'submitting' ? 'Sending…'
    : null;

  return (
    <form
      onSubmit={handleSubmit}
      onFocusCapture={handleFormStart}
      className="relative rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-7"
    >
      <p className="font-display text-xl tracking-tight sm:text-2xl">Get a free appraisal</p>
      <p className="mt-1.5 text-[14px] leading-relaxed text-muted-foreground">
        No charge, no obligation. We will tell you what is worth selling and what is not.
      </p>

      <div className="mt-5 grid gap-3.5 sm:grid-cols-2">
        <div>
          <label htmlFor={`${uid}-name`} className="mb-1.5 block text-[13px] font-semibold">
            Your name
          </label>
          <input
            id={`${uid}-name`} required maxLength={200} autoComplete="name"
            value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
            className={FIELD}
          />
        </div>
        <div>
          <label htmlFor={`${uid}-phone`} className="mb-1.5 block text-[13px] font-semibold">
            Phone
          </label>
          <input
            id={`${uid}-phone`} required type="tel" maxLength={50} autoComplete="tel"
            inputMode="tel" value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            className={FIELD}
          />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor={`${uid}-email`} className="mb-1.5 block text-[13px] font-semibold">
            Email <span className="font-normal text-muted-foreground">— optional</span>
          </label>
          <input
            id={`${uid}-email`} type="email" maxLength={320} autoComplete="email"
            inputMode="email" value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className={FIELD}
          />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor={`${uid}-items`} className="mb-1.5 block text-[13px] font-semibold">
            What do you have?
          </label>
          <textarea
            id={`${uid}-items`} rows={3} maxLength={5000}
            placeholder={`A house in ${city}, a single piece, a collection — and any deadline we should know about.`}
            value={form.items} onChange={(e) => setForm({ ...form, items: e.target.value })}
            className={`${FIELD} h-auto resize-y py-3 leading-relaxed`}
          />
        </div>
      </div>

      {photos.length > 0 && (
        <ul className="mt-4 flex flex-wrap gap-2">
          {photos.map((p, i) => (
            <li key={i} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.preview} alt="" className="h-16 w-16 rounded-lg border border-border object-cover" />
              <button
                type="button" onClick={() => removePhoto(i)}
                aria-label={`Remove photo ${i + 1}`}
                className="absolute -right-2 -top-2 grid h-7 w-7 place-items-center rounded-full border border-border bg-background text-muted-foreground shadow-sm hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <input
        ref={fileInputRef} type="file" accept="image/*,.heic,.heif" multiple
        onChange={handlePhotoSelect} className="hidden" id={`${uid}-photos`}
      />

      {/* Honeypot — off-screen, out of the tab order, hidden from readers. */}
      <div aria-hidden="true" className="absolute -left-[9999px] top-0 h-px w-px overflow-hidden">
        <label htmlFor={`${uid}-hp`}>Company</label>
        <input
          id={`${uid}-hp`} name="company" type="text" tabIndex={-1} autoComplete="off"
          value={hp} onChange={(e) => setHp(e.target.value)}
        />
      </div>

      <div className="mt-5 flex flex-col gap-2.5 sm:flex-row-reverse">
        <button
          type="submit" disabled={submitting}
          // w-full (not flex-1) while the row is stacked: in a column flex
          // container `flex-basis:0%` from flex-1 overrides h-12 on the main
          // axis and collapses the button to its line-height.
          className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-primary px-6 text-[15px] font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60 sm:w-auto sm:flex-1"
        >
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {busyLabel ?? 'Request my free appraisal'}
        </button>
        <button
          type="button" onClick={() => fileInputRef.current?.click()} disabled={submitting}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-lg border border-border px-5 text-[15px] font-medium transition-colors hover:bg-secondary disabled:opacity-60"
        >
          <Camera className="h-4 w-4" />
          {photos.length > 0 ? `${photos.length} photo${photos.length !== 1 ? 's' : ''}` : 'Add photos'}
        </button>
      </div>

      <p className="mt-3.5 text-[13.5px] leading-relaxed text-muted-foreground">
        Photos get you a faster and far more accurate answer — up to {MAX_PHOTOS}.
      </p>
    </form>
  );
}
