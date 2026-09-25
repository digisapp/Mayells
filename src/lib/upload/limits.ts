// Limits for the seller photo-upload link (/upload/[token]). Shared by the
// signed-url API route and the upload page, so the page can tell a seller
// exactly what is wrong before a single byte goes over their mobile data,
// and the two can never drift apart.

export const UPLOAD_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
  'image/heic',
  'image/heif',
] as const;

export const UPLOAD_VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm'] as const;

export const UPLOAD_ALLOWED_TYPES: readonly string[] = [...UPLOAD_IMAGE_TYPES, ...UPLOAD_VIDEO_TYPES];

const MB = 1024 * 1024;
export const MAX_IMAGE_BYTES = 15 * MB;
// Matches the `lot-images` bucket's own 25MB limit. Promising more here just
// moves the failure to the storage PUT, after the seller has waited through
// the whole upload.
export const MAX_VIDEO_BYTES = 25 * MB;

/** Photos (or videos) one item can carry, and items one send can carry. */
export const MAX_MEDIA_PER_ITEM = 30;
export const MAX_ITEMS_PER_SEND = 100;
export const MAX_NOTE_CHARS = 5000;

/** Where a seller can send something too large for the page. Mail Drop takes big videos. */
export const UPLOAD_HELP_EMAIL = 'info@mayells.com';

const EXTENSION_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  avif: 'image/avif',
  heic: 'image/heic',
  heif: 'image/heif',
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mov: 'video/quicktime',
  qt: 'video/quicktime',
  webm: 'video/webm',
};

/**
 * The content type to upload a file as. Some pickers hand over HEIC or MOV
 * files with an empty `type`; the extension is the only clue then.
 */
export function uploadContentType(file: { type: string; name: string }): string {
  if (file.type) return file.type.toLowerCase();
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  return EXTENSION_TYPES[ext] ?? '';
}

export function isVideoType(contentType: string): boolean {
  return contentType.startsWith('video/');
}

export function maxBytesFor(contentType: string): number {
  return isVideoType(contentType) ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
}

/** Whole megabytes, rounded up, so "25 MB" is never shown for a 25.4 MB file. */
export function formatMegabytes(bytes: number): string {
  return `${Math.max(1, Math.ceil(bytes / MB))} MB`;
}

/**
 * Roughly how long a clip of this video would fit under the limit, rounded
 * down to 5 seconds. Uses the real duration when the browser could read it;
 * otherwise assumes about 1 MB a second, which is what an iPhone records at
 * 1080p.
 */
export function suggestedClipSeconds(bytes: number, durationSec?: number | null): number {
  const bytesPerSecond =
    durationSec && durationSec > 0 && Number.isFinite(durationSec) ? bytes / durationSec : 1 * MB;
  const fits = (MAX_VIDEO_BYTES * 0.9) / bytesPerSecond;
  return Math.max(5, Math.floor(fits / 5) * 5);
}

export function tooLargeMessage(
  { bytes, isVideo }: { bytes: number; isVideo: boolean },
  durationSec?: number | null,
): string {
  if (isVideo) {
    return (
      `This video is ${formatMegabytes(bytes)}; the limit is ${formatMegabytes(MAX_VIDEO_BYTES)}. ` +
      `Record or trim a shorter clip (about ${suggestedClipSeconds(bytes, durationSec)} seconds), ` +
      `or email it to ${UPLOAD_HELP_EMAIL}.`
    );
  }
  return (
    `This photo is ${formatMegabytes(bytes)}; the limit is ${formatMegabytes(MAX_IMAGE_BYTES)}. ` +
    `Take it again with the Photo button, or email it to ${UPLOAD_HELP_EMAIL}.`
  );
}

export const UNSUPPORTED_TYPE_MESSAGE =
  'This kind of file can’t be sent here. Please send photos (JPEG, HEIC or PNG) or videos (MOV or MP4).';

export type FileCheck =
  | { ok: true; contentType: string }
  | { ok: false; reason: 'unsupported' }
  | { ok: false; reason: 'too-large'; bytes: number; isVideo: boolean };

/** Whether the server will accept this file, decided before uploading it. */
export function checkUploadFile(file: { type: string; name: string; size: number }): FileCheck {
  const contentType = uploadContentType(file);
  if (!UPLOAD_ALLOWED_TYPES.includes(contentType)) return { ok: false, reason: 'unsupported' };
  if (file.size > maxBytesFor(contentType)) {
    return { ok: false, reason: 'too-large', bytes: file.size, isVideo: isVideoType(contentType) };
  }
  return { ok: true, contentType };
}
