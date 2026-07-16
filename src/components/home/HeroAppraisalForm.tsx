'use client';

import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { CheckCircle, ArrowRight, Camera, X, MessageCircle, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
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

function formatRange(low: number, high: number): string {
  return low === high ? formatUsd(low) : `${formatUsd(low)} – ${formatUsd(high)}`;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (ev) => resolve(ev.target?.result as string);
    reader.onerror = () => resolve('');
    reader.readAsDataURL(file);
  });
}

export function HeroAppraisalForm() {
  const [form, setForm] = useState({ name: '', email: '', phone: '', items: '' });
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [estimate, setEstimate] = useState<EstimateResult | null>(null);
  const [stage, setStage] = useState<'uploading' | 'analyzing' | 'submitting' | null>(null);
  const [uploadProgress, setUploadProgress] = useState({ done: 0, total: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const imageFiles = files.filter((f) => f.type.startsWith('image/') || f.name.toLowerCase().endsWith('.heic'));
    if (imageFiles.length < files.length) {
      toast.error('Some files were skipped — only photos can be uploaded.');
    }
    if (photos.length + imageFiles.length > MAX_PHOTOS) {
      toast.error(`Maximum ${MAX_PHOTOS} photos allowed`);
      return;
    }
    // Shrink on-device before preview/upload: faster on cell connections and
    // converts HEIC to JPEG on browsers that can decode it.
    const compressed = await Promise.all(imageFiles.map((f) => compressImage(f)));
    const sized = compressed.filter((f) => f.size <= MAX_FILE_SIZE);
    if (sized.length < compressed.length) {
      toast.error('Some photos were over 15MB and were skipped.');
    }
    // Build each preview alongside its file so the two can never get out of order
    const newPhotos = await Promise.all(
      sized.map(async (file) => ({ file, preview: await readFileAsDataUrl(file) })),
    );
    setPhotos((prev) => [...prev, ...newPhotos]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removePhoto = (index: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      // Photos go directly to storage (request bodies through the API are
      // size-capped), then only their paths are submitted.
      let photoPaths: string[] = [];
      if (photos.length > 0) {
        setStage('uploading');
        const { paths, failed } = await uploadPhotosDirect(
          photos.map((p) => p.file),
          (done, total) => setUploadProgress({ done, total }),
        );
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
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          phone: form.phone,
          items: form.items,
          photoPaths,
        }),
      });
      if (res.ok) {
        const body = await res.json().catch(() => null);
        setEstimate(body?.data?.estimate ?? null);
        setSubmitted(true);
      } else {
        toast.error('Failed to submit. Please try again.');
      }
    } catch {
      toast.error('Network error. Please try again.');
    } finally {
      setSubmitting(false);
      setStage(null);
    }
  };

  return (
    <div className="bg-white/[0.04] border border-white/10 rounded-xl sm:rounded-2xl p-5 sm:p-7">
      {submitted ? (
        estimate ? (
          <div className="py-2">
            <div className="flex items-center gap-2 mb-4">
              <Sparkles className="h-4 w-4 text-champagne" />
              <span className="text-[11px] uppercase tracking-[0.2em] text-champagne font-semibold">
                Preliminary Estimate
              </span>
            </div>
            <p className="font-display text-3xl tracking-tight tabular-nums">
              {formatRange(estimate.estimateLow, estimate.estimateHigh)}
            </p>
            <p className="mt-3 text-sm text-white/70 leading-relaxed">{estimate.summary}</p>
            <div className="mt-5 pt-4 border-t border-white/10 flex items-start gap-2.5">
              <CheckCircle className="h-4 w-4 text-champagne mt-0.5 shrink-0" />
              <p className="text-[13px] text-white/60 leading-relaxed">
                Request received. A specialist will confirm this estimate and contact you within 24 hours.
              </p>
            </div>
            <p className="mt-3 text-[11px] text-white/35">
              AI-generated preliminary range based on your photos — not a formal appraisal.
            </p>
          </div>
        ) : (
          <div className="text-center py-6">
            <CheckCircle className="h-10 w-10 text-champagne mx-auto mb-3" />
            <h3 className="font-display text-lg mb-1">Request Received</h3>
            <p className="text-white/60 text-sm">
              A specialist will contact you within 24 hours.
            </p>
          </div>
        )
      ) : (
        <>
          <h3 className="font-display text-lg mb-1">Request a Free Appraisal</h3>
          <p className="text-[13px] text-white/45 mb-5 flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-champagne/80" />
            Add photos to get an instant AI estimate
          </p>
          <form onSubmit={handleSubmit} className="space-y-3">
            <input
              type="text"
              placeholder="Your Name"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full bg-white/[0.06] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-champagne/50 transition-colors"
            />
            <div className="grid grid-cols-2 gap-3">
              <input
                type="email"
                placeholder="Email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full bg-white/[0.06] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-champagne/50 transition-colors"
              />
              <input
                type="tel"
                placeholder="Phone"
                required
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="w-full bg-white/[0.06] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-champagne/50 transition-colors"
              />
            </div>
            <textarea
              placeholder="What items do you have?"
              rows={2}
              value={form.items}
              onChange={(e) => setForm({ ...form, items: e.target.value })}
              className="w-full bg-white/[0.06] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-champagne/50 transition-colors resize-none"
            />

            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handlePhotoSelect}
                className="hidden"
              />
              {photos.length > 0 && (
                <div className="flex gap-2 mb-2 flex-wrap">
                  {photos.map((photo, i) => (
                    <div key={i} className="relative group">
                      <img
                        src={photo.preview}
                        alt={`Photo ${i + 1}`}
                        className="h-12 w-12 object-cover rounded-lg border border-white/10"
                        onError={(e) => {
                          // Browsers that can't decode HEIC show a neutral tile
                          e.currentTarget.src =
                            'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"><rect width="48" height="48" fill="%23555" rx="8"/></svg>';
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => removePhoto(i)}
                        className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full flex items-center justify-center gap-2 bg-white/[0.06] border border-dashed border-white/20 hover:border-champagne/40 rounded-lg px-4 py-2.5 text-sm text-white/50 hover:text-white/70 transition-colors"
              >
                <Camera className="h-4 w-4" />
                {photos.length > 0 ? `${photos.length} photo${photos.length !== 1 ? 's' : ''} — add more` : 'Upload photos for an instant estimate'}
              </button>
            </div>

            <Button type="submit" variant="champagne" size="lg" className="w-full" disabled={submitting}>
              {submitting
                ? stage === 'uploading'
                  ? `Uploading photos… (${uploadProgress.done}/${uploadProgress.total})`
                  : stage === 'analyzing'
                    ? 'Analyzing your photos…'
                    : 'Submitting...'
                : photos.length > 0
                  ? 'Get Instant Estimate'
                  : 'Get Free Appraisal'}
              {!submitting && <ArrowRight className="ml-2 h-4 w-4" />}
            </Button>
            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => window.dispatchEvent(new CustomEvent('open-chat'))}
                className="text-sm text-champagne/80 hover:text-champagne transition-colors flex items-center gap-1.5"
              >
                <MessageCircle className="h-4 w-4" />
                Chat with a specialist
              </button>
            </div>
          </form>
        </>
      )}
    </div>
  );
}
