// Client-side helpers for the public appraisal/consignment photo flow.
//
// Photos go DIRECTLY to Supabase storage via short-lived signed upload URLs,
// then only the storage paths are posted to our API. Routing file bytes
// through the API is not an option: Vercel rejects request bodies over
// ~4.5MB (413 FUNCTION_PAYLOAD_TOO_LARGE), and a single phone photo can
// exceed that on its own.

export const MAX_PHOTOS = 50;
export const MAX_FILE_SIZE = 15 * 1024 * 1024; // keep in sync with the API

/**
 * Downscale/re-encode a photo on-device before upload (max 2000px, JPEG 80%).
 * Cuts upload time on cell connections and converts HEIC to JPEG on browsers
 * that can decode it (Safari). Files the browser can't decode pass through
 * unchanged — the server-side image transform handles those for the AI.
 */
export function compressImage(file: File, maxDim = 2000, quality = 0.8): Promise<File> {
  return new Promise((resolve) => {
    if (file.size <= 500 * 1024) { resolve(file); return; }
    const img = new window.Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        const scale = maxDim / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (blob && blob.size < file.size) {
            resolve(new File([blob], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' }));
          } else {
            resolve(file);
          }
        },
        'image/jpeg',
        quality,
      );
      URL.revokeObjectURL(img.src);
    };
    img.onerror = () => resolve(file);
    img.src = URL.createObjectURL(file);
  });
}

interface SignedUpload {
  index: number;
  path: string;
  signedUrl: string;
}

/**
 * Upload photos straight to storage. Returns the storage paths of every
 * photo that made it, reporting progress via `onProgress(done, total)`.
 * Tolerates partial failure — a dropped photo shouldn't kill the lead.
 */
export async function uploadPhotosDirect(
  files: File[],
  onProgress?: (done: number, total: number) => void,
): Promise<{ paths: string[]; failed: number }> {
  if (files.length === 0) return { paths: [], failed: 0 };

  const res = await fetch('/api/appraisal-requests/upload-urls', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      files: files.map((f) => ({ name: f.name, type: f.type || 'application/octet-stream', size: f.size })),
    }),
  });
  if (!res.ok) throw new Error('Could not prepare photo upload');
  const { data } = (await res.json()) as { data: { uploads: SignedUpload[] } };
  const uploads = data.uploads;

  const paths: (string | null)[] = new Array(uploads.length).fill(null);
  let done = 0;
  const total = uploads.length;

  // Small concurrency pool: parallel enough to be fast, gentle on mobile radios.
  const POOL = 4;
  let cursor = 0;
  async function worker() {
    while (cursor < uploads.length) {
      const i = cursor++;
      const u = uploads[i];
      const file = files[u.index];
      try {
        const put = await fetch(u.signedUrl, {
          method: 'PUT',
          headers: { 'Content-Type': file.type || 'application/octet-stream' },
          body: file,
        });
        if (put.ok) paths[i] = u.path;
      } catch {
        // leave as null — counted as failed below
      }
      done++;
      onProgress?.(done, total);
    }
  }
  await Promise.all(Array.from({ length: Math.min(POOL, uploads.length) }, worker));

  const succeeded = paths.filter((p): p is string => p !== null);
  return { paths: succeeded, failed: files.length - succeeded.length };
}
