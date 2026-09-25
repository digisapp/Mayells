import { reencodePolicy } from './reencode-policy';
import { stripHeicLocation } from './strip-heic-location';
import { orAfterVisible, startVisibleTimer } from './visible-time';

/**
 * Give up on a photo after this long on screen and keep the original. Visible
 * time (see visible-time.ts): a locked phone decodes nothing, so its minutes
 * away don't count against the photo.
 */
export const PREP_TIMEOUT_MS = 20_000;
/**
 * Then give patching location out of a kept HEIC this long. With the decode's
 * own limit it stays inside the upload queue's COMPRESS_TIMEOUT_MS.
 */
const STRIP_TIMEOUT_MS = 4_000;

export interface PrepareImageOptions {
  /** Longest edge of the upload rendition, in px. */
  maxDim?: number;
  /** JPEG quality, 0–1. */
  quality?: number;
  /** Longest edge of an optional preview thumbnail, in px (0 = none). */
  thumbnailDim?: number;
  timeoutMs?: number;
}

export interface PreparedImage {
  /** What to upload: a re-encoded JPEG, or the original when kept or undecodable. */
  file: File;
  /** Small JPEG for an on-screen tile, drawn from the same decode; null if not made. */
  thumbnail: Blob | null;
}

/**
 * Downscale and re-encode a photo on the device before upload (JPEG, metadata
 * dropped). Cuts upload time on cellular and converts HEIC wherever the
 * browser can decode it (Safari).
 *
 * Never rejects and never hangs: iOS can refuse a canvas once its canvas
 * memory is spent, fail a decode, or leave toBlob pending, and each of those
 * resolves with the original file instead — the server-side transform still
 * handles it for the AI. A HEIC kept that way has its location patched out of
 * its bytes first. Canvases are released as soon as they're encoded, so a
 * long batch doesn't pile up canvas memory.
 */
export function prepareImage(file: File, options: PrepareImageOptions = {}): Promise<PreparedImage> {
  const { maxDim = 2000, quality = 0.8, thumbnailDim = 0, timeoutMs = PREP_TIMEOUT_MS } = options;
  const policy = reencodePolicy(file);
  const original: PreparedImage = { file, thumbnail: null };
  if ((policy === 'keep' && !thumbnailDim) || typeof window === 'undefined') {
    return Promise.resolve(original);
  }

  const reencoded = new Promise<PreparedImage>((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new window.Image();
    const canvases: HTMLCanvasElement[] = [];
    let settled = false;

    const finish = (result: PreparedImage) => {
      if (settled) return;
      settled = true;
      cancelTimer();
      img.onload = null;
      img.onerror = null;
      URL.revokeObjectURL(url);
      img.removeAttribute('src'); // lets WebKit drop the decoded bitmap
      canvases.forEach(release);
      resolve(result);
    };
    const cancelTimer = startVisibleTimer(timeoutMs, () => finish(original));

    img.onerror = () => finish(original);
    img.onload = async () => {
      try {
        const main = policy === 'keep' ? null : await encodeJpeg(img, maxDim, quality, canvases);
        const thumbnail = thumbnailDim ? await encodeJpeg(img, thumbnailDim, 0.7, canvases) : null;
        // A converted HEIC is used even when the JPEG is larger: the original
        // would reach the bucket with its location intact.
        const useMain = main !== null && (policy === 'convert' || main.size < file.size);
        finish({
          file: useMain
            ? new File([main], `${file.name.replace(/\.[^./]+$/, '') || 'photo'}.jpg`, {
                type: 'image/jpeg',
                lastModified: file.lastModified,
              })
            : file,
          thumbnail,
        });
      } catch {
        finish(original);
      }
    };
    img.src = url;
  });

  // A photo that had to be converted but came back as it was is one the
  // browser couldn't decode (desktop Chrome and Firefox can't read HEIC; iOS
  // sometimes fails or runs out of time). It still goes up, but without the
  // seller's location in it. If patching fails too, the server's scrub after
  // sending is the backstop.
  return reencoded.then(async (result) =>
    policy === 'convert' && result.file === file
      ? { ...result, file: await orAfterVisible(stripHeicLocation(file), STRIP_TIMEOUT_MS, file) }
      : result,
  );
}

/**
 * Backward-compatible entry point (seller upload flow, chat, lead forms):
 * the upload rendition only.
 */
export function compressImage(file: File, maxDim = 2000, quality = 0.8): Promise<File> {
  return prepareImage(file, { maxDim, quality }).then((r) => r.file);
}

function release(canvas: HTMLCanvasElement) {
  // iOS counts canvas backing stores against a fixed budget until they're
  // garbage-collected; zeroing the size frees it now.
  canvas.width = 0;
  canvas.height = 0;
}

function encodeJpeg(
  img: HTMLImageElement,
  maxDim: number,
  quality: number,
  canvases: HTMLCanvasElement[],
): Promise<Blob | null> {
  const { naturalWidth: w0, naturalHeight: h0 } = img;
  if (!w0 || !h0) return Promise.resolve(null);
  const scale = Math.min(1, maxDim / Math.max(w0, h0));
  const width = Math.max(1, Math.round(w0 * scale));
  const height = Math.max(1, Math.round(h0 * scale));

  const canvas = document.createElement('canvas');
  canvases.push(canvas);
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.resolve(null);
  // JPEG has no alpha: transparent PNG areas would otherwise turn black.
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, width, height);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, width, height);

  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => {
        release(canvas);
        resolve(blob);
      },
      'image/jpeg',
      quality,
    );
  });
}
