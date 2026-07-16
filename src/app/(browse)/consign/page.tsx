'use client';

import { useState, useRef } from 'react';
import { track } from '@vercel/analytics';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import {
  CheckCircle,
  Camera,
  ArrowRight,
  X,
  MessageCircle,
  Clock,
  Sparkles,
} from 'lucide-react';
import { BUSINESS } from '@/lib/config';
import { compressImage, uploadPhotosDirect, MAX_PHOTOS, MAX_FILE_SIZE } from '@/lib/upload/direct-upload';


const steps = [
  {
    num: '01',
    title: 'Submit Online or Schedule a Visit',
    desc: 'Upload photos below or schedule a free in-person appraisal. Our team serves South Florida and New York City.',
  },
  {
    num: '02',
    title: 'Free Appraisal & Pickup',
    desc: 'We come to you for complimentary appraisals and item pickup — or handle full estate cleanouts, same day if needed.',
  },
  {
    num: '03',
    title: 'Choose Your Path',
    desc: 'We recommend the best sale method — live online auction, gallery, or private sale — based on your item and goals.',
  },
  {
    num: '04',
    title: 'We Handle Everything',
    desc: 'Professional photography, cataloging, marketing, and secure handling. You get paid when your item sells.',
  },
];


interface PhotoItem {
  file: File;
  preview: string;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (ev) => resolve(ev.target?.result as string);
    reader.onerror = () => resolve('');
    reader.readAsDataURL(file);
  });
}

interface ConsignEstimate {
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

export default function ConsignPage() {
  const [form, setForm] = useState({ name: '', email: '', phone: '', items: '' });
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [estimate, setEstimate] = useState<ConsignEstimate | null>(null);
  const [stage, setStage] = useState<'uploading' | 'analyzing' | 'submitting' | null>(null);
  const [uploadProgress, setUploadProgress] = useState({ done: 0, total: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const imageFiles = files.filter((f) => f.type.startsWith('image/') || f.name.toLowerCase().endsWith('.heic'));
    if (photos.length + imageFiles.length > MAX_PHOTOS) {
      toast.error(`Maximum ${MAX_PHOTOS} photos allowed`);
      return;
    }
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
      // Photos upload directly to storage — the API request body is
      // size-capped by the platform, so only the paths go through it.
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
          phone: form.phone,
          email: form.email,
          items: form.items,
          service: 'Consignment',
          photoPaths,
        }),
      });
      if (res.ok) {
        const body = await res.json().catch(() => null);
        setEstimate(body?.data?.estimate ?? null);
        setSubmitted(true);
        track('consignment_started', { photoCount: photos.length });
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
    <div>
      {/* Hero */}
      <section className="bg-charcoal text-white py-16 md:py-24">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <span className="text-[11px] uppercase tracking-[0.2em] text-champagne font-semibold">Sell With Us</span>
          <h1 className="font-display text-display-lg mt-3 mb-5">Consign Your Pieces</h1>
          <p className="text-lg text-white/70 max-w-2xl mx-auto leading-relaxed">
            Whether it&apos;s a single heirloom or an entire estate, our team in Boca Raton and Tribeca, NYC
            will come to you for free appraisals, item pickup, and same-day estate cleanouts.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <a href="#submit-form">
              <Button variant="champagne" size="lg">
                Submit an Item
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </a>
          </div>
        </div>
      </section>

      {/* Social Proof Stats */}
      <section className="border-b border-white/10 bg-charcoal">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            {[
              { value: '500+', label: 'Items Sold' },
              { value: '24hr', label: 'Average Response' },
              { value: '$2M+', label: 'in Sales' },
              { value: 'Free', label: 'Appraisals' },
            ].map((stat) => (
              <div key={stat.label}>
                <span className="text-lg font-display text-champagne">{stat.value}</span>
                <p className="text-[11px] uppercase tracking-wider text-white/50 mt-0.5">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <h2 className="font-display text-display-sm text-center mb-12">How Consignment Works</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {steps.map((step) => (
            <div key={step.num} className="text-center">
              <span className="text-3xl font-display text-champagne">{step.num}</span>
              <h3 className="font-medium text-sm mt-2 mb-1">{step.title}</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">{step.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Why Mayells vs Big Auction Houses */}
      <section className="bg-ivory">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <h2 className="font-display text-display-sm text-center mb-4">Why Consign With Mayells</h2>
          <p className="text-center text-muted-foreground text-sm max-w-2xl mx-auto mb-12">
            Traditional auction houses can involve long waiting periods, complex fee structures, and selective consignment policies.
            At Mayells, we offer a simpler, faster approach designed for modern sellers.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
            {[
              {
                title: 'No Hidden Fees',
                desc: 'Many auction houses charge additional fees for photography, catalog production, insurance, and storage. With Mayells, there are no upfront costs \u2014 our commission covers the entire process.',
              },
              {
                title: 'We Handle Entire Collections',
                desc: 'Rather than accepting only select pieces, Mayells specializes in complete estate and collection consignments \u2014 from fine art and antiques to design, jewelry, and collectibles.',
              },
              {
                title: 'Faster Payment',
                desc: 'Items are typically listed within 30 days, and sellers are paid within 30 days of the auction closing.',
              },
              {
                title: 'Monthly Auctions',
                desc: 'Our monthly auctions ensure your items reach buyers quickly \u2014 often within weeks.',
              },
              {
                title: 'In-Home Appraisals & Pickup',
                desc: 'We offer complimentary in-home appraisals and pickup services across South Florida and New York.',
              },
              {
                title: 'Simple & Transparent',
                desc: 'From pickup to auction, our process is straightforward and efficient \u2014 no surprises, no hidden invoices.',
              },
            ].map((item) => (
              <div key={item.title} className="bg-white rounded-xl border border-black/5 p-6">
                <div className="flex items-start gap-3">
                  <CheckCircle className="h-5 w-5 text-champagne mt-0.5 flex-shrink-0" />
                  <div>
                    <h3 className="font-semibold text-base mb-1">{item.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>


      {/* Submission Form */}
      <section id="submit-form" className="bg-white">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          {submitted ? (
            <div className="text-center py-8">
              <CheckCircle className="h-12 w-12 text-champagne mx-auto mb-4" />
              <h2 className="font-display text-xl text-charcoal mb-2">Submission Received</h2>
              <p className="text-muted-foreground text-sm mb-8">
                Thank you! We&apos;ll review your submission and call you within 24 hours.
              </p>

              {estimate && (
                <div className="bg-charcoal text-white rounded-xl p-6 mb-8 text-left">
                  <div className="flex items-center gap-2 mb-3">
                    <Sparkles className="h-4 w-4 text-champagne" />
                    <span className="text-[11px] uppercase tracking-[0.2em] text-champagne font-semibold">
                      Preliminary Estimate
                    </span>
                  </div>
                  <p className="font-display text-3xl tracking-tight tabular-nums">
                    {estimate.estimateLow === estimate.estimateHigh
                      ? formatUsd(estimate.estimateLow)
                      : `${formatUsd(estimate.estimateLow)} – ${formatUsd(estimate.estimateHigh)}`}
                  </p>
                  <p className="mt-3 text-sm text-white/70 leading-relaxed">{estimate.summary}</p>
                  <p className="mt-4 text-[11px] text-white/35">
                    AI-generated preliminary range based on your photos — a specialist will confirm before anything is finalized.
                  </p>
                </div>
              )}

              <div className="bg-gray-50 rounded-xl border border-gray-100 p-6 mb-8 text-left">
                <h3 className="font-semibold text-sm text-charcoal mb-4 text-center">What happens next</h3>
                <div className="space-y-3">
                  {[
                    { num: '1', text: 'We review your photos and item details' },
                    { num: '2', text: 'We call to discuss value and next steps' },
                    { num: '3', text: 'We come to you for free pickup' },
                  ].map((step) => (
                    <div key={step.num} className="flex items-start gap-3">
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-champagne/20 text-champagne text-xs font-semibold flex items-center justify-center">{step.num}</span>
                      <p className="text-sm text-muted-foreground">{step.text}</p>
                    </div>
                  ))}
                </div>
              </div>

              <p className="text-sm text-muted-foreground mb-6">
                Want to talk sooner? Call us at{' '}
                <a href={BUSINESS.phoneHref} className="text-champagne font-medium hover:underline">
                  {BUSINESS.phone}
                </a>
              </p>

              <div className="flex gap-3 justify-center">
                <Button variant="outline" className="border-gray-200 text-charcoal hover:bg-gray-50" onClick={() => { setSubmitted(false); setForm({ name: '', email: '', phone: '', items: '' }); setPhotos([]); }}>
                  Submit Another
                </Button>
                <Link href="/">
                  <Button variant="champagne">Back to Home</Button>
                </Link>
              </div>
            </div>
          ) : (
            <>
              <h2 className="font-display text-display-sm text-center mb-2 text-charcoal">Submit Your Item</h2>
              <p className="text-center text-muted-foreground text-sm mb-4">
                Tell us about your piece — no obligation, completely confidential.
              </p>
              <div className="flex items-center justify-center gap-1.5 mb-8">
                <Clock className="h-3.5 w-3.5 text-champagne" />
                <span className="text-xs text-muted-foreground">Most sellers hear back the same day</span>
              </div>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <input
                    type="text"
                    placeholder="Your Name *"
                    required
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-sm text-charcoal placeholder:text-gray-400 focus:outline-none focus:border-champagne/50 transition-colors"
                  />
                  <input
                    type="tel"
                    placeholder="Phone Number *"
                    required
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-sm text-charcoal placeholder:text-gray-400 focus:outline-none focus:border-champagne/50 transition-colors"
                  />
                </div>
                <input
                  type="email"
                  placeholder="Email Address"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-sm text-charcoal placeholder:text-gray-400 focus:outline-none focus:border-champagne/50 transition-colors"
                />
                <textarea
                  placeholder="Describe your item(s): what it is, condition, provenance, dimensions, any known history..."
                  rows={4}
                  value={form.items}
                  onChange={(e) => setForm({ ...form, items: e.target.value })}
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-sm text-charcoal placeholder:text-gray-400 focus:outline-none focus:border-champagne/50 transition-colors resize-none"
                />

                {/* Photo Upload */}
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
                    <div className="flex gap-2 mb-3 flex-wrap">
                      {photos.map((photo, i) => (
                        <div key={i} className="relative group">
                          <img
                            src={photo.preview}
                            alt={`Photo ${i + 1}`}
                            className="h-16 w-16 object-cover rounded-lg border border-gray-200"
                            onError={(e) => {
                              // Browsers that can't decode HEIC show a neutral tile
                              e.currentTarget.src =
                                'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="%23ddd" rx="8"/></svg>';
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => removePhoto(i)}
                            className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full flex items-center justify-center gap-2 bg-gray-50 border border-dashed border-gray-300 hover:border-champagne/60 rounded-lg px-4 py-3 text-sm text-gray-500 hover:text-charcoal transition-colors"
                  >
                    <Camera className="h-4 w-4" />
                    {photos.length > 0 ? `${photos.length} photo${photos.length !== 1 ? 's' : ''} — add more` : 'Upload photos (recommended)'}
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
                      : 'Get Your Free Appraisal'}
                  {!submitting && <ArrowRight className="ml-2 h-4 w-4" />}
                </Button>
                <p className="text-[11px] text-muted-foreground text-center">
                  No obligation. Completely confidential.
                </p>
              </form>

              <div className="flex items-center gap-3 mt-6">
                <div className="flex-1 h-px bg-gray-200" />
                <span className="text-[11px] text-muted-foreground uppercase tracking-widest">or</span>
                <div className="flex-1 h-px bg-gray-200" />
              </div>

              <button
                type="button"
                onClick={() => window.dispatchEvent(new CustomEvent('open-chat', { detail: { message: 'I have an item I\'d like to consign' } }))}
                className="mt-4 w-full flex items-center justify-center gap-2.5 bg-charcoal hover:bg-charcoal/90 border border-charcoal text-white rounded-xl px-5 py-3.5 transition-colors"
              >
                <MessageCircle className="h-4 w-4" />
                <span className="text-sm font-medium">Chat with a Specialist</span>
              </button>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
