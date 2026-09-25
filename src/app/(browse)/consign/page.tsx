'use client';

import { useEffect, useState, useRef } from 'react';
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
import {
  usePhotoAttachments,
  withMissingPhotosNote,
  missingPhotosHeadline,
  PHOTOS_EMAIL,
  PHOTOS_MAILTO,
  type PhotoUploadResult,
} from '@/lib/upload/use-photo-attachments';
import { keepScreenAwake } from '@/lib/upload/wake-lock';
import { revealIfHidden } from '@/lib/upload/reveal-if-hidden';


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

const FIELD =
  'w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-base sm:text-sm text-charcoal placeholder:text-gray-400 focus:outline-none focus:border-champagne/50 transition-colors';

export default function ConsignPage() {
  const [form, setForm] = useState({ name: '', email: '', phone: '', items: '' });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [estimate, setEstimate] = useState<ConsignEstimate | null>(null);
  const [stage, setStage] = useState<'uploading' | 'analyzing' | 'submitting' | null>(null);
  const [uploadProgress, setUploadProgress] = useState({ done: 0, total: 0 });
  const [photoShortfall, setPhotoShortfall] = useState<PhotoUploadResult | null>(null);
  const { photos, preparing, add, remove, clear, upload, submissionId } = usePhotoAttachments();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const formSectionRef = useRef<HTMLElement>(null);

  // The confirmation is shorter than the form, so on a phone it would land
  // above the viewport and leave the seller looking at the footer.
  useEffect(() => {
    if (submitted) revealIfHidden(formSectionRef.current);
  }, [submitted]);

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.currentTarget;
    const files = Array.from(input.files ?? []);
    input.value = '';
    await add(files);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (preparing) return;
    setSubmitting(true);
    const releaseScreen = keepScreenAwake();
    try {
      // Photos upload directly to storage — the API request body is
      // size-capped by the platform, so only the paths go through it. The
      // name and phone are the lead: a failed upload never stops them being
      // sent, and the note tells the specialist to ask for the photos.
      let photoResult: PhotoUploadResult = { paths: [], failed: 0, total: 0 };
      if (photos.length > 0) {
        setStage('uploading');
        photoResult = await upload((done, total) => setUploadProgress({ done, total }));
      }

      setStage(photoResult.paths.length > 0 ? 'analyzing' : 'submitting');
      const res = await fetch('/api/appraisal-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          phone: form.phone,
          email: form.email,
          items: withMissingPhotosNote(form.items, photoResult),
          service: 'Consignment',
          photoPaths: photoResult.paths,
          // Same id on a retry, so a send whose reply was lost isn't recorded twice.
          submissionId,
        }),
      });
      if (res.ok) {
        const body = await res.json().catch(() => null);
        setEstimate(body?.data?.estimate ?? null);
        setPhotoShortfall(photoResult.failed > 0 ? photoResult : null);
        setSubmitted(true);
        track('consignment_started', { photoCount: photoResult.paths.length });
      } else if (res.status === 429) {
        toast.error(`Too many requests. Please call us at ${BUSINESS.phone}.`);
      } else {
        const body = await res.json().catch(() => null);
        toast.error(
          res.status === 400 && body?.error
            ? body.error
            : `Something went wrong. Please try again, or call us at ${BUSINESS.phone}.`,
        );
      }
    } catch {
      toast.error('Couldn’t connect. Check your signal and try again — nothing you entered was lost.');
    } finally {
      releaseScreen();
      setSubmitting(false);
      setStage(null);
    }
  };

  return (
    <div>
      {/* Hero */}
      <section className="bg-charcoal text-white py-16 md:py-24">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <span className="text-eyebrow text-champagne">Sell With Us</span>
          <h1 className="font-display text-display-lg mt-3 mb-5">Consign Your Pieces</h1>
          <p className="text-lg text-white/70 max-w-2xl mx-auto leading-relaxed">
            Whether it&apos;s a single heirloom or an entire estate, our team in Palm Beach and New York City
            will come to you for free appraisals, item pickup, and same-day estate cleanouts.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button asChild variant="champagne" size="lg">
              <a href="#submit-form">
                Submit an Item
                <ArrowRight className="ml-2 h-4 w-4" />
              </a>
            </Button>
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
      {/* scroll-mt: the hero's "Submit an Item" anchor lands with the heading
          clear of the sticky header (h-16 / sm:h-[72px]). */}
      <section ref={formSectionRef} id="submit-form" className="bg-white scroll-mt-16 sm:scroll-mt-[72px]">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 pb-16 sm:py-16">
          {submitted ? (
            <div className="text-center py-8">
              <CheckCircle className="h-12 w-12 text-champagne mx-auto mb-4" />
              <h2 className="font-display text-xl text-charcoal mb-2">Submission Received</h2>
              <p className="text-muted-foreground text-sm mb-8">
                Thank you! We&apos;ll review your submission and call you within 24 hours.
              </p>

              {photoShortfall && (
                <div role="status" className="rounded-xl border border-champagne/40 bg-champagne/[0.08] px-5 py-4 mb-8 text-left">
                  <p className="text-sm font-semibold text-charcoal">{missingPhotosHeadline(photoShortfall)}</p>
                  <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
                    We have your details, and your specialist will ask for them when they call. To send them now,
                    email{' '}
                    <a href={PHOTOS_MAILTO} className="text-charcoal font-medium underline underline-offset-2">
                      {PHOTOS_EMAIL}
                    </a>
                    .
                  </p>
                </div>
              )}

              {estimate && (
                <div className="bg-charcoal text-white rounded-xl p-6 mb-8 text-left">
                  <div className="flex items-center gap-2 mb-3">
                    <Sparkles className="h-4 w-4 text-champagne" />
                    <span className="text-eyebrow text-champagne">
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
                <a href={BUSINESS.phoneHref} className="inline-flex min-h-11 items-center lg:min-h-0 text-champagne font-medium hover:underline">
                  {BUSINESS.phone}
                </a>
              </p>

              <div className="flex gap-3 justify-center">
                <Button
                  variant="outline"
                  className="h-11 lg:h-9 border-gray-200 text-charcoal hover:bg-gray-50"
                  onClick={() => {
                    setSubmitted(false);
                    setEstimate(null);
                    setPhotoShortfall(null);
                    setForm({ name: '', email: '', phone: '', items: '' });
                    clear();
                  }}
                >
                  Submit Another
                </Button>
                <Button asChild variant="champagne" className="h-11 lg:h-9">
                  <Link href="/">Back to Home</Link>
                </Button>
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
                    name="name"
                    placeholder="Your Name *"
                    aria-label="Your name"
                    required
                    maxLength={200}
                    autoComplete="name"
                    enterKeyHint="next"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className={FIELD}
                  />
                  <input
                    type="tel"
                    name="phone"
                    placeholder="Phone Number *"
                    aria-label="Phone number"
                    required
                    maxLength={50}
                    autoComplete="tel"
                    enterKeyHint="next"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className={FIELD}
                  />
                </div>
                <input
                  type="email"
                  name="email"
                  placeholder="Email Address"
                  aria-label="Email address (optional)"
                  maxLength={320}
                  autoComplete="email"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  enterKeyHint="next"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className={FIELD}
                />
                <textarea
                  name="items"
                  placeholder="Describe your item(s): what it is, condition, provenance, dimensions, any known history..."
                  aria-label="Describe your items"
                  rows={4}
                  maxLength={5000}
                  value={form.items}
                  onChange={(e) => setForm({ ...form, items: e.target.value })}
                  className={`${FIELD} resize-none`}
                />

                {/* Photo Upload */}
                <div>
                  {/* No `capture`: it forces the camera and hides the photo
                      library. Plain image/* also lets iOS hand HEIC over as JPEG. */}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handlePhotoSelect}
                    className="hidden"
                  />
                  {photos.length > 0 && (
                    <ul className="flex gap-2 pt-1 mb-3 flex-wrap" aria-label="Attached photos">
                      {photos.map((photo, i) => (
                        <li key={photo.id} className="relative group">
                          {/* eslint-disable-next-line @next/next/no-img-element -- local file preview */}
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
                          {/* 44px hit area around a small visible dot */}
                          <button
                            type="button"
                            onClick={() => remove(photo.id)}
                            disabled={submitting}
                            aria-label={`Remove photo ${i + 1}`}
                            className="absolute -top-4 -right-4 grid h-11 w-11 place-items-center opacity-100 lg:opacity-0 lg:group-hover:opacity-100 lg:focus-visible:opacity-100 transition-opacity disabled:hidden"
                          >
                            <span className="grid h-6 w-6 place-items-center rounded-full bg-black/75 text-white ring-1 ring-white/40 shadow-sm">
                              <X className="h-3.5 w-3.5" />
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={!!preparing || submitting}
                    className="w-full min-h-12 flex items-center justify-center gap-2 bg-gray-50 border border-dashed border-gray-300 hover:border-champagne/60 rounded-lg px-4 py-3 text-sm text-gray-500 hover:text-charcoal transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    <Camera className="h-4 w-4" />
                    {preparing
                      ? `Preparing photos… ${preparing.done} of ${preparing.total}`
                      : photos.length > 0
                        ? `${photos.length} photo${photos.length !== 1 ? 's' : ''} — add more`
                        : 'Upload photos (recommended)'}
                  </button>
                </div>

                <Button
                  type="submit"
                  variant="champagne"
                  size="lg"
                  // Busy, the label carries progress: keep it legible.
                  className="w-full disabled:opacity-85"
                  disabled={submitting || !!preparing}
                >
                  {preparing
                    ? 'Preparing photos…'
                    : submitting
                      ? stage === 'uploading'
                        ? `Uploading photos… (${uploadProgress.done}/${uploadProgress.total})`
                        : stage === 'analyzing'
                          ? 'Analyzing your photos…'
                          : 'Submitting…'
                      : photos.length > 0
                        ? 'Get Instant Estimate'
                        : 'Get Your Free Appraisal'}
                  {!submitting && !preparing && <ArrowRight className="ml-2 h-4 w-4" />}
                </Button>
                <p aria-live="polite" className="text-[12px] text-muted-foreground text-center">
                  {submitting && stage === 'uploading'
                    ? 'Keep this page open while your photos upload.'
                    : submitting && stage === 'analyzing'
                      ? 'This can take up to a minute.'
                      : 'No obligation. Completely confidential.'}
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
