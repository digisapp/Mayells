'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { track } from '@vercel/analytics';
import { toast } from 'sonner';
import { ArrowRight, Camera, CheckCircle2, Loader2, MessageCircle, Phone, X } from 'lucide-react';
import { BUSINESS } from '@/lib/config';
import { MAX_PHOTOS } from '@/lib/upload/direct-upload';
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
import { useHideChatLauncher } from '@/components/chat/use-hide-chat-launcher';

// 16px text stops iOS zooming into a focused field; h-12 keeps every control
// over the 44px touch minimum for an audience that skews older.
const FIELD =
  'w-full h-12 rounded-lg border border-input bg-background px-3.5 text-base text-foreground ' +
  'outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground/70 ' +
  'focus-visible:border-foreground/60 focus-visible:ring-2 focus-visible:ring-champagne/40';

const LABEL = 'mb-1.5 block text-[13px] font-semibold text-foreground';

const EMPTY = { name: '', email: '', phone: '', items: '' };

function openChat() {
  window.dispatchEvent(new CustomEvent('open-chat', { detail: { message: 'I have something I’d like to sell' } }));
}

/**
 * The /consign lead form: a white card that sits in the page's charcoal
 * hero. Name and phone are the lead; photos are optional and can never hold
 * it back (see usePhotoAttachments). The seller hears that the request
 * arrived and what happens next — never an automated price.
 */
export function ConsignForm() {
  const uid = useId();
  const [form, setForm] = useState(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [stage, setStage] = useState<'uploading' | 'sending' | null>(null);
  const [uploadProgress, setUploadProgress] = useState({ done: 0, total: 0 });
  const [sent, setSent] = useState<{ firstName: string; phone: string; shortfall: PhotoUploadResult | null } | null>(null);
  const { photos, preparing, add, remove, clear, upload, submissionId } = usePhotoAttachments();
  // Honeypot: off-screen, so only form-filling bots see it. The server drops
  // a filled one with a success-shaped reply.
  const [hp, setHp] = useState('');
  const started = useRef(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useHideChatLauncher(rootRef);

  // The confirmation is shorter than the form, so on a phone it could land
  // above the viewport and leave the seller looking at the next section.
  useEffect(() => {
    if (sent) revealIfHidden(rootRef.current);
  }, [sent]);

  const handleStart = () => {
    if (started.current) return;
    started.current = true;
    track('consign_form_start');
  };

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.currentTarget;
    const files = Array.from(input.files ?? []);
    input.value = '';
    await add(files);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (preparing || submitting) return;
    setSubmitting(true);
    const releaseScreen = keepScreenAwake();
    try {
      // Photos upload straight to storage (request bodies are size-capped);
      // only their paths go with the lead. A failed upload never stops the
      // name and number being sent, and the note tells the specialist to ask.
      let photoResult: PhotoUploadResult = { paths: [], failed: 0, total: 0 };
      if (photos.length > 0) {
        setStage('uploading');
        photoResult = await upload((done, total) => setUploadProgress({ done, total }));
      }

      setStage('sending');
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
          hp,
          // Same id on a retry, so a send whose reply was lost isn't recorded twice.
          submissionId,
        }),
      });
      if (res.ok) {
        setSent({
          firstName: form.name.trim().split(/\s+/)[0] ?? '',
          phone: form.phone.trim(),
          shortfall: photoResult.failed > 0 ? photoResult : null,
        });
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

  const startAnother = () => {
    setSent(null);
    setForm(EMPTY);
    clear();
    started.current = false;
  };

  const busyLabel = preparing
    ? 'Preparing photos…'
    : stage === 'uploading'
      ? `Uploading photos… ${uploadProgress.done} of ${uploadProgress.total}`
      : stage === 'sending'
        ? 'Sending…'
        : null;

  return (
    <div
      ref={rootRef}
      // Clears the sticky header when a link or the confirmation scrolls here.
      className="scroll-mt-24 rounded-2xl bg-card p-5 text-card-foreground shadow-luxury ring-1 ring-black/5 sm:p-8"
    >
      {sent ? (
        <div>
          <CheckCircle2 className="h-9 w-9 text-champagne-deep" aria-hidden />
          <h2 className="mt-4 font-display text-2xl tracking-tight sm:text-[1.75rem]">
            Thank you{sent.firstName ? `, ${sent.firstName}` : ''}.
          </h2>
          <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
            Your request is with our specialists. We&rsquo;ll call you
            {sent.phone ? <> on <span className="whitespace-nowrap font-medium text-foreground">{sent.phone}</span></> : null}{' '}
            within one business day.
          </p>

          {sent.shortfall && (
            <div role="status" className="mt-5 rounded-lg border border-champagne/50 bg-champagne/10 px-4 py-3">
              <p className="text-[14px] font-semibold">{missingPhotosHeadline(sent.shortfall)}</p>
              <p className="mt-1 text-[14px] leading-relaxed text-muted-foreground">
                We have your details, and your specialist will ask for them when they call. To send them now, email{' '}
                <a href={PHOTOS_MAILTO} className="font-medium text-foreground underline underline-offset-2">
                  {PHOTOS_EMAIL}
                </a>
                .
              </p>
            </div>
          )}

          <h3 className="mt-7 text-eyebrow text-champagne-deep">What happens next</h3>
          <ol className="mt-3 space-y-3">
            {[
              'We look over your photos and notes.',
              'A specialist calls to talk through what you have, what it could fetch and how best to sell it.',
              'If you decide to go ahead, we agree the terms in writing and arrange how your pieces reach us.',
            ].map((text, i) => (
              <li key={text} className="flex gap-3 text-[14px] leading-relaxed text-muted-foreground">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-secondary text-[12px] font-semibold text-foreground tabular-nums">
                  {i + 1}
                </span>
                {text}
              </li>
            ))}
          </ol>

          <div className="mt-7 flex flex-col gap-2.5 sm:flex-row">
            <button
              type="button"
              onClick={startAnother}
              className="inline-flex h-12 items-center justify-center rounded-lg border border-border px-5 text-[15px] font-medium transition-colors hover:bg-secondary"
            >
              Send another item
            </button>
            <a
              href={BUSINESS.phoneHref}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-lg px-5 text-[15px] font-medium text-foreground transition-colors hover:bg-secondary"
            >
              <Phone className="h-4 w-4" aria-hidden />
              <span className="tabular-nums">{BUSINESS.phone}</span>
            </a>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} onFocusCapture={handleStart} className="relative" aria-labelledby={`${uid}-title`}>
          <h2 id={`${uid}-title`} className="font-display text-2xl tracking-tight sm:text-[1.75rem]">
            Request a free appraisal
          </h2>
          <p className="mt-1.5 text-[14px] leading-relaxed text-muted-foreground">
            Tell us what you have. A specialist will call you with an honest view of what it&rsquo;s worth and the best
            way to sell it.
          </p>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor={`${uid}-name`} className={LABEL}>
                Your name
              </label>
              <input
                id={`${uid}-name`}
                name="name"
                required
                maxLength={200}
                autoComplete="name"
                enterKeyHint="next"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className={FIELD}
              />
            </div>
            <div>
              <label htmlFor={`${uid}-phone`} className={LABEL}>
                Phone
              </label>
              <input
                id={`${uid}-phone`}
                name="phone"
                type="tel"
                required
                maxLength={50}
                autoComplete="tel"
                inputMode="tel"
                enterKeyHint="next"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className={FIELD}
              />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor={`${uid}-email`} className={LABEL}>
                Email <span className="font-normal text-muted-foreground">(optional)</span>
              </label>
              <input
                id={`${uid}-email`}
                name="email"
                type="email"
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
            </div>
            <div className="sm:col-span-2">
              <label htmlFor={`${uid}-items`} className={LABEL}>
                What would you like to sell?
              </label>
              <textarea
                id={`${uid}-items`}
                name="items"
                rows={3}
                maxLength={5000}
                placeholder="A signed oil painting, a watch, a whole house of contents — plus anything you know about where it came from."
                value={form.items}
                onChange={(e) => setForm({ ...form, items: e.target.value })}
                className={`${FIELD} h-auto resize-y py-3 leading-relaxed`}
              />
            </div>
          </div>

          {/* Photos */}
          <div className="mt-4">
            <p className={LABEL} id={`${uid}-photos-label`}>
              Photos <span className="font-normal text-muted-foreground">(optional, but they help)</span>
            </p>
            {photos.length > 0 && (
              <ul className="mb-3 flex flex-wrap gap-2 pt-1" aria-label="Attached photos">
                {photos.map((photo, i) => (
                  <li key={photo.id} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element -- local file preview */}
                    <img
                      src={photo.preview}
                      alt={`Photo ${i + 1}`}
                      className="h-16 w-16 rounded-lg border border-border bg-secondary object-cover"
                      onError={(e) => {
                        // Browsers that can't decode HEIC show a neutral tile
                        e.currentTarget.src =
                          'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="%23e8e6e1" rx="8"/></svg>';
                      }}
                    />
                    {/* 44px hit area around a small visible dot */}
                    <button
                      type="button"
                      onClick={() => remove(photo.id)}
                      disabled={submitting}
                      aria-label={`Remove photo ${i + 1}`}
                      className="group absolute -right-4 -top-4 grid h-11 w-11 place-items-center disabled:hidden"
                    >
                      <span className="grid h-6 w-6 place-items-center rounded-full bg-charcoal text-white shadow-sm ring-2 ring-card group-hover:bg-black">
                        <X className="h-3.5 w-3.5" />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {/* image/* only: listing .heic makes iOS hand over the HEIC
                original instead of a JPEG, and `capture` would hide the
                photo library. */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handlePhotoSelect}
              className="hidden"
              aria-labelledby={`${uid}-photos-label`}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={!!preparing || submitting}
              aria-describedby={`${uid}-photos-hint`}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-lg border border-dashed border-foreground/25 bg-secondary/50 px-4 py-3 text-[15px] font-medium text-foreground transition-colors hover:border-champagne-deep/60 hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Camera className="h-4 w-4" aria-hidden />
              {preparing
                ? `Preparing photos… ${preparing.done} of ${preparing.total}`
                : photos.length > 0
                  ? `${photos.length} photo${photos.length !== 1 ? 's' : ''} added — add more`
                  : 'Add photos'}
            </button>
            <p id={`${uid}-photos-hint`} className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
              The front, the back, and any signature, marks or labels. Up to {MAX_PHOTOS}.
            </p>
          </div>

          {/* Honeypot — off-screen, out of the tab order, hidden from readers. */}
          <div aria-hidden="true" className="absolute -left-[9999px] top-0 h-px w-px overflow-hidden">
            {/* Named so no browser autofill maps it (see CityConsignForm). */}
            <label htmlFor={`${uid}-hp`}>Leave this empty</label>
            <input
              id={`${uid}-hp`}
              name="hp_confirm"
              type="text"
              tabIndex={-1}
              autoComplete="new-password"
              value={hp}
              onChange={(e) => setHp(e.target.value)}
            />
          </div>

          <button
            type="submit"
            disabled={submitting || !!preparing}
            className="mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-champagne px-6 text-[15px] font-semibold text-charcoal shadow-sm transition-colors hover:bg-champagne/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-charcoal focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-85"
          >
            {busyLabel ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />
                {busyLabel}
              </>
            ) : (
              <>
                Request free appraisal
                <ArrowRight className="h-4 w-4" aria-hidden />
              </>
            )}
          </button>
          <p aria-live="polite" className="mt-3 text-center text-[13px] leading-relaxed text-muted-foreground">
            {stage === 'uploading'
              ? 'Keep this page open while your photos upload.'
              : 'Free and confidential. No obligation, and no account needed.'}
          </p>

          <div className="mt-5 flex flex-wrap items-center justify-center gap-x-1 border-t border-border pt-4 text-[14px] text-muted-foreground">
            <span>Prefer to talk?</span>
            <a
              href={BUSINESS.phoneHref}
              className="inline-flex min-h-11 items-center gap-1.5 px-1.5 font-medium text-foreground underline-offset-4 hover:underline"
            >
              <Phone className="h-3.5 w-3.5" aria-hidden />
              <span className="tabular-nums">{BUSINESS.phone}</span>
            </a>
            {/* The divider only while both fit on one line. */}
            <span aria-hidden className="hidden text-border sm:inline">
              |
            </span>
            <button
              type="button"
              onClick={openChat}
              className="inline-flex min-h-11 items-center gap-1.5 px-1.5 font-medium text-foreground underline-offset-4 hover:underline"
            >
              <MessageCircle className="h-3.5 w-3.5" aria-hidden />
              Chat with a specialist
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
