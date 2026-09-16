'use client';

// Client side of the admin direct-to-storage upload flow.
//
// Bytes go straight to Supabase Storage via a short-lived signed URL from
// `POST /api/upload/signed-url`; only the resulting public URL is handed back
// to the caller. Routing the file through `/api/upload` is not an option for
// phone photos: Vercel rejects request bodies over ~4.5 MB before the route's
// own size check ever runs.

import { compressImage } from '@/lib/upload/compress-image';

// Mirror of the server allow-list in /api/upload/signed-url.
export const ADMIN_UPLOAD_ALLOWED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
  'image/heic',
  'image/heif',
] as const;
const ALLOWED_EXT = ['jpg', 'jpeg', 'png', 'webp', 'avif', 'heic', 'heif'];
const HEIC_TYPES = ['image/heic', 'image/heif'];
export const ADMIN_UPLOAD_MAX_SIZE = 15 * 1024 * 1024; // keep in sync with the API
// The accept list deliberately omits HEIC: iOS then hands the picker a JPEG
// rendition of camera-roll photos instead of the raw HEIC. A HEIC that
// arrives anyway (desktop drag-in) is still accepted — see uploadImageAsAdmin.
export const ADMIN_UPLOAD_ACCEPT = 'image/jpeg,image/png,image/webp,image/avif';

/** Human-readable rejection reason, or null when the file may be uploaded. */
export function validateAdminUploadFile(file: File): string | null {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  const typeOk =
    (ADMIN_UPLOAD_ALLOWED_TYPES as readonly string[]).includes(file.type) ||
    (!file.type && ALLOWED_EXT.includes(ext));
  if (!typeOk) {
    return `Unsupported type (${file.type || ext || 'unknown'}) — use JPEG, PNG, WebP, AVIF, or HEIC`;
  }
  if (file.size === 0) return 'Empty file';
  if (file.size > ADMIN_UPLOAD_MAX_SIZE) {
    return `Too large (${(file.size / 1024 / 1024).toFixed(1)} MB; max 15 MB)`;
  }
  return null;
}

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const data = await res.json();
    return (data && typeof data.error === 'string' && data.error) || fallback;
  } catch {
    return fallback;
  }
}

export interface AdminUploadResult {
  url: string;
  path: string;
}

/**
 * Upload one image as the signed-in admin and resolve to its public URL.
 * Rejects with an Error whose message is safe to show the admin (the server's
 * `error` string, or a short network/status description).
 *
 * Catalog photos are uploaded as-is — no downscaling, a luxury catalog needs
 * the pixels. The one exception is HEIC: browsers that can decode it (Safari)
 * re-encode it to JPEG so the result renders everywhere and the AI can read
 * it; others upload the HEIC unchanged.
 */
export async function uploadImageAsAdmin(
  file: File,
  opts: { onProgress?: (pct: number) => void; signal?: AbortSignal } = {},
): Promise<AdminUploadResult> {
  const reason = validateAdminUploadFile(file);
  if (reason) throw new Error(reason);

  let toUpload = file;
  if (HEIC_TYPES.includes(file.type)) {
    toUpload = await compressImage(file, 4000, 0.92);
  }
  const contentType = toUpload.type || 'application/octet-stream';

  const signedRes = await fetch('/api/upload/signed-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename: toUpload.name, contentType, fileSize: toUpload.size }),
    signal: opts.signal,
  });
  if (!signedRes.ok) {
    throw new Error(await readError(signedRes, 'Could not prepare the upload'));
  }
  const { signedUrl, token, path, publicUrl } = (await signedRes.json()) as {
    signedUrl: string;
    token?: string;
    path: string;
    publicUrl: string;
  };

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const abort = () => xhr.abort();
    opts.signal?.addEventListener('abort', abort, { once: true });
    const done = () => opts.signal?.removeEventListener('abort', abort);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) opts.onProgress?.(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      done();
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Storage rejected the upload (HTTP ${xhr.status})`));
    };
    xhr.onerror = () => { done(); reject(new Error('Network error during upload')); };
    xhr.ontimeout = () => { done(); reject(new Error('Upload timed out')); };
    xhr.onabort = () => { done(); reject(new Error('Upload cancelled')); };

    // Supabase signed upload URL expects PUT with the token as a header.
    xhr.open('PUT', signedUrl);
    xhr.setRequestHeader('Content-Type', contentType);
    xhr.setRequestHeader('x-upsert', 'false');
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.timeout = 300000; // 5 minutes
    xhr.send(toUpload);
  });

  return { url: publicUrl, path };
}
