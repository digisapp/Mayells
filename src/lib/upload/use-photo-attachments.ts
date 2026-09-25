'use client';

// Photo attachments for the public lead forms (homepage hero, /consign, city
// microsites): pick, prepare on-device, preview, and upload straight to
// storage. The forms differ in look only; this keeps their behaviour in step.

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { BUSINESS } from '@/lib/config';
import { prepareImage } from './compress-image';
import { mapWithConcurrency } from './concurrency';
import { MAX_FILE_SIZE, MAX_PHOTOS, PHOTO_PHASE_DEADLINE_MS, uploadPhotosWithDeadline } from './direct-upload';

/** Photos decoded at once. More than two can reload the tab on an iPhone. */
const PREP_CONCURRENCY = 2;
/** Preview edge in px: a 64px tile at 3x. Full-size previews of 30 photos cost hundreds of MB of decoded bitmaps. */
const THUMB_DIM = 192;
/** The server caps a lead's description at this many characters. */
const ITEMS_MAX = 5000;

export interface PhotoAttachment {
  id: number;
  file: File;
  /** Object URL for the tile; revoked when the photo is removed. */
  preview: string;
}

export interface PhotoUploadResult {
  /** Storage paths for the lead POST. */
  paths: string[];
  failed: number;
  total: number;
  /** The photo phase hit its deadline and the lead went without the stragglers. */
  timedOut?: boolean;
}

export function isPhotoFile(file: File): boolean {
  return file.type.startsWith('image/') || /\.(heic|heif)$/i.test(file.name);
}

/**
 * One id per filled-in form, sent with every attempt at it. A send whose
 * reply was lost (the phone locked, the signal dropped) may already be
 * saved; the retry carries the same id, so the server answers it with the
 * first one's result instead of recording the lead twice.
 */
export function newSubmissionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  // randomUUID needs a secure context; plain-http previews don't have one.
  const hex = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20)}`;
}

export function usePhotoAttachments() {
  const [photos, setPhotos] = useState<PhotoAttachment[]>([]);
  const [preparing, setPreparing] = useState<{ done: number; total: number } | null>(null);
  const [submissionId, setSubmissionId] = useState(newSubmissionId);
  const nextId = useRef(0);
  const objectUrls = useRef(new Set<string>());
  // Storage path per photo already uploaded, so a retry after a failed lead
  // POST sends what's stored instead of uploading every photo again.
  const uploaded = useRef(new Map<number, string>());

  useEffect(() => {
    const urls = objectUrls.current;
    return () => {
      urls.forEach((u) => URL.revokeObjectURL(u));
      urls.clear();
    };
  }, []);

  const add = async (list: FileList | File[] | null) => {
    const files = Array.from(list ?? []);
    const images = files.filter(isPhotoFile);
    if (images.length < files.length) {
      toast.error('Some files were skipped — only photos can be uploaded.');
    }
    const accepted = images.slice(0, Math.max(0, MAX_PHOTOS - photos.length));
    if (accepted.length < images.length) {
      toast.error(
        accepted.length > 0
          ? `Up to ${MAX_PHOTOS} photos — the first ${accepted.length} were added.`
          : `You've reached the limit of ${MAX_PHOTOS} photos.`,
      );
    }
    if (accepted.length === 0) return;

    setPreparing({ done: 0, total: accepted.length });
    try {
      const prepared = await mapWithConcurrency(
        accepted,
        PREP_CONCURRENCY,
        (file) => prepareImage(file, { thumbnailDim: THUMB_DIM }),
        (done, total) => setPreparing({ done, total }),
      );
      const fitting = prepared.filter((p) => p.file.size <= MAX_FILE_SIZE);
      if (fitting.length < prepared.length) {
        toast.error('Some photos were over 15MB and were skipped.');
      }
      const added = fitting.map(({ file, thumbnail }) => {
        const preview = URL.createObjectURL(thumbnail ?? file);
        objectUrls.current.add(preview);
        return { id: nextId.current++, file, preview };
      });
      setPhotos((prev) => [...prev, ...added]);
    } finally {
      setPreparing(null);
    }
  };

  const forget = (photo: PhotoAttachment) => {
    URL.revokeObjectURL(photo.preview);
    objectUrls.current.delete(photo.preview);
    uploaded.current.delete(photo.id);
  };

  const remove = (id: number) => {
    const photo = photos.find((p) => p.id === id);
    if (photo) forget(photo);
    setPhotos((prev) => prev.filter((p) => p.id !== id));
  };

  /** Empty the form's photos for a new request, which gets a new submission id. */
  const clear = () => {
    photos.forEach(forget);
    setPhotos([]);
    setSubmissionId(newSubmissionId());
  };

  /**
   * Upload every photo not yet stored. Never throws: a photo that can't be
   * uploaded is counted in `failed`, and the lead goes ahead without it.
   * Gives up on stragglers after PHOTO_PHASE_DEADLINE_MS on screen, so the
   * name and number are never held back for long.
   */
  const upload = async (onProgress?: (done: number, total: number) => void): Promise<PhotoUploadResult> => {
    const total = photos.length;
    const pending = photos.filter((p) => !uploaded.current.has(p.id));
    const already = total - pending.length;
    let timedOut = false;
    if (pending.length > 0) {
      onProgress?.(already, total);
      let results: (string | null)[] = [];
      try {
        ({ results, timedOut } = await uploadPhotosWithDeadline(
          pending.map((p) => p.file),
          (done) => onProgress?.(already + done, total),
          { deadlineMs: PHOTO_PHASE_DEADLINE_MS },
        ));
      } catch {
        // No upload URLs at all (rate limit, outage): every pending photo failed.
      }
      pending.forEach((p, i) => {
        const path = results[i];
        if (path) uploaded.current.set(p.id, path);
      });
    }
    const paths = photos.flatMap((p) => {
      const path = uploaded.current.get(p.id);
      return path ? [path] : [];
    });
    const failed = total - paths.length;
    return { paths, failed, total, ...(timedOut && failed > 0 ? { timedOut: true } : {}) };
  };

  return { photos, preparing, add, remove, clear, upload, submissionId };
}

/**
 * Append a note for the specialist when photos didn't arrive, so the lead
 * tells them to ask for the photos. Kept inside the server's length cap
 * without cutting the note off.
 */
export function withMissingPhotosNote(items: string, result: PhotoUploadResult): string {
  if (result.failed === 0) return items;
  // Only the photos whose paths are in this request were received; the
  // rest may be half-uploaded at best, so the specialist asks for them.
  const why = result.timedOut ? ' in time (slow connection)' : '';
  const note =
    result.failed === result.total
      ? `[All ${result.total} photo(s) failed to upload${why} — please ask the seller to resend them.]`
      : `[${result.failed} of ${result.total} photo(s) did not upload${why} — please ask the seller to resend them.]`;
  const text = items.trim();
  return text ? `${text.slice(0, ITEMS_MAX - note.length - 2)}\n\n${note}` : note;
}

/** Seller-facing headline for photos that didn't upload. */
export function missingPhotosHeadline({ failed, total, timedOut }: PhotoUploadResult): string {
  const what = timedOut ? "didn't finish uploading" : "didn't come through";
  return failed === total
    ? `Your photo${total === 1 ? '' : 's'} ${what}.`
    : `${failed} of your ${total} photos ${what}.`;
}

/** Where a seller can send photos that didn't upload (inbound mail reaches the team with attachments). */
export const PHOTOS_EMAIL = BUSINESS.email;
export const PHOTOS_MAILTO = `mailto:${BUSINESS.email}?subject=${encodeURIComponent('Photos for my appraisal request')}`;
