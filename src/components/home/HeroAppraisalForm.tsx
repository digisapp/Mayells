'use client';

import { useEffect, useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { CheckCircle, ArrowRight, Camera, X, MessageCircle } from 'lucide-react';
import { toast } from 'sonner';
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
import { useHideChatLauncher } from '@/components/chat/use-hide-chat-launcher';

const FIELD =
  'w-full bg-white/[0.06] border border-white/10 rounded-lg px-4 py-2.5 text-base sm:text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-champagne/50 transition-colors';

export function HeroAppraisalForm() {
  const [form, setForm] = useState({ name: '', email: '', phone: '', items: '' });
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [stage, setStage] = useState<'uploading' | 'submitting' | null>(null);
  const [uploadProgress, setUploadProgress] = useState({ done: 0, total: 0 });
  const [photoShortfall, setPhotoShortfall] = useState<PhotoUploadResult | null>(null);
  const { photos, preparing, add, remove, upload, submissionId } = usePhotoAttachments();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useHideChatLauncher(rootRef);

  // The confirmation is much shorter than the form, so on a phone it would
  // land above the viewport and leave the seller looking at the next section.
  useEffect(() => {
    if (submitted) revealIfHidden(rootRef.current);
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
      // Photos go directly to storage (request bodies through the API are
      // size-capped), then only their paths are submitted. The name and phone
      // are the lead: a failed upload never stops them being sent.
      let photoResult: PhotoUploadResult = { paths: [], failed: 0, total: 0 };
      if (photos.length > 0) {
        setStage('uploading');
        photoResult = await upload((done, total) => setUploadProgress({ done, total }));
      }

      setStage('submitting');
      const res = await fetch('/api/appraisal-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          phone: form.phone,
          items: withMissingPhotosNote(form.items, photoResult),
          photoPaths: photoResult.paths,
          // Same id on a retry, so a send whose reply was lost isn't recorded twice.
          submissionId,
        }),
      });
      if (res.ok) {
        setPhotoShortfall(photoResult.failed > 0 ? photoResult : null);
        setSubmitted(true);
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

  const shortfallNotice = photoShortfall && (
    <div role="status" className="mt-5 rounded-lg border border-champagne/25 bg-champagne/[0.07] px-4 py-3 text-left">
      <p className="text-[13px] font-medium text-white/85">{missingPhotosHeadline(photoShortfall)}</p>
      <p className="mt-1 text-[13px] leading-relaxed text-white/60">
        We have your details, and your specialist will ask for them when they call. To send them now, email{' '}
        <a href={PHOTOS_MAILTO} className="text-champagne underline underline-offset-2">
          {PHOTOS_EMAIL}
        </a>
        .
      </p>
    </div>
  );

  const submitLabel = preparing
    ? 'Preparing photos…'
    : submitting
      ? stage === 'uploading'
        ? `Uploading photos… (${uploadProgress.done}/${uploadProgress.total})`
        : 'Sending…'
      : 'Request Free Appraisal';

  return (
    <div ref={rootRef} className="scroll-mt-20 bg-white/[0.04] border border-white/10 rounded-xl sm:rounded-2xl p-5 sm:p-7">
      {submitted ? (
        <div className="text-center py-6">
          <CheckCircle className="h-10 w-10 text-champagne mx-auto mb-3" />
          <h3 className="font-display text-lg mb-1">Request Received</h3>
          <p className="text-white/60 text-sm">
            A specialist will call you within one business day.
          </p>
          {shortfallNotice}
        </div>
      ) : (
        <>
          <h3 className="font-display text-lg mb-1">Request a Free Appraisal</h3>
          <p className="text-[13px] text-white/55 mb-5">
            Free and confidential, with no obligation. Photos help us answer faster.
          </p>
          <form onSubmit={handleSubmit} className="space-y-3">
            <input
              type="text"
              name="name"
              placeholder="Your Name"
              aria-label="Your name"
              required
              maxLength={200}
              autoComplete="name"
              enterKeyHint="next"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className={FIELD}
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                type="email"
                name="email"
                placeholder="Email"
                aria-label="Email (optional)"
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
              <input
                type="tel"
                name="phone"
                placeholder="Phone"
                aria-label="Phone"
                required
                maxLength={50}
                autoComplete="tel"
                enterKeyHint="next"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className={FIELD}
              />
            </div>
            <textarea
              name="items"
              placeholder="What items do you have?"
              aria-label="What items do you have?"
              rows={2}
              maxLength={5000}
              value={form.items}
              onChange={(e) => setForm({ ...form, items: e.target.value })}
              className={`${FIELD} resize-none`}
            />

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
                <ul className="flex flex-wrap gap-2 pt-1 pb-2" aria-label="Attached photos">
                  {photos.map((photo, i) => (
                    <li key={photo.id} className="relative group">
                      {/* eslint-disable-next-line @next/next/no-img-element -- local file preview */}
                      <img
                        src={photo.preview}
                        alt={`Photo ${i + 1}`}
                        className="h-14 w-14 sm:h-12 sm:w-12 object-cover rounded-lg border border-white/10"
                        onError={(e) => {
                          // Browsers that can't decode HEIC show a neutral tile
                          e.currentTarget.src =
                            'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"><rect width="48" height="48" fill="%23555" rx="8"/></svg>';
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
                        <span className="grid h-6 w-6 place-items-center rounded-full bg-black/75 text-white ring-1 ring-white/25">
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
                className="w-full min-h-11 flex items-center justify-center gap-2 bg-white/[0.06] border border-dashed border-white/20 hover:border-champagne/40 rounded-lg px-4 py-2.5 text-sm text-white/50 hover:text-white/70 transition-colors disabled:opacity-60"
              >
                <Camera className="h-4 w-4" />
                {preparing
                  ? `Preparing photos… ${preparing.done} of ${preparing.total}`
                  : photos.length > 0
                    ? `${photos.length} photo${photos.length !== 1 ? 's' : ''} — add more`
                    : 'Add photos (optional)'}
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
              {submitLabel}
              {!submitting && !preparing && <ArrowRight className="ml-2 h-4 w-4" />}
            </Button>
            <p aria-live="polite" className="text-center text-[12px] text-white/45 empty:hidden">
              {submitting && stage === 'uploading'
                ? 'Keep this page open while your photos upload.'
                : ''}
            </p>
            <div className="flex items-center justify-center">
              <button
                type="button"
                onClick={() => window.dispatchEvent(new CustomEvent('open-chat'))}
                className="min-h-11 px-3 text-sm text-champagne/80 hover:text-champagne transition-colors flex items-center gap-1.5"
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
