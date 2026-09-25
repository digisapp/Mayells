import sharp from 'sharp';
import { createAdminClient } from '@/lib/supabase/admin';
import { logger } from '@/lib/logger';
import { stripHeifMetadata } from '@/lib/upload/strip-heic-location';

const BUCKET = 'lot-images';

const FORMAT_MIME: Record<string, string> = {
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

/**
 * Re-encode an image without its metadata (EXIF, GPS, XMP, IPTC).
 *
 * Photos land in a public bucket and later appear in the public auction
 * catalog — phone-camera EXIF can embed the GPS coordinates of the
 * consignor's home, so it must never survive to a public URL.
 *
 * Returns null when there is nothing to do (no metadata present) or the
 * format isn't one we can safely re-encode (videos, HEIC) — callers keep
 * the original in that case. Orientation is baked into the pixels via
 * rotate() before the EXIF tag carrying it is dropped.
 */
export async function stripImageMetadata(
  input: Buffer | ArrayBuffer,
): Promise<{ buffer: Buffer; contentType: string } | null> {
  try {
    const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
    const img = sharp(buf, { failOn: 'none' });
    const meta = await img.metadata();
    // sharp ≥0.35 reports AVIF files as format 'heif' with av1 compression
    // (there is no 'avif' FormatEnum key anymore). Plain HEIC (hevc) still
    // falls through to the null return below, as before.
    const isAvif = meta.format === 'heif' && meta.compression === 'av1';
    const mime = isAvif ? 'image/avif' : meta.format ? FORMAT_MIME[meta.format] : undefined;
    if (!mime) return null;
    if (!meta.exif && !meta.xmp && !meta.iptc) return null;

    const rotated = img.rotate(); // sharp output drops metadata by default
    let out: Buffer;
    if (isAvif) {
      out = await rotated.avif({ quality: 60 }).toBuffer();
    } else {
      switch (meta.format) {
        case 'png':
          out = await rotated.png().toBuffer();
          break;
        case 'webp':
          out = await rotated.webp({ quality: 90 }).toBuffer();
          break;
        default:
          out = await rotated.jpeg({ quality: 90, mozjpeg: true }).toBuffer();
      }
    }
    return { buffer: out, contentType: mime };
  } catch {
    return null;
  }
}

/**
 * Bytes that are safe to store publicly: the stripped image when it carried
 * metadata, the original when it is a readable JPEG/PNG/WebP with none (e.g.
 * a canvas-compressed phone photo), or null when it can't be read or is a
 * format we can't sanitize (HEIC, videos) — callers must drop those.
 */
export async function sanitizeImageForStorage(
  input: Buffer,
): Promise<{ buffer: Buffer; contentType: string } | null> {
  const stripped = await stripImageMetadata(input);
  if (stripped) return stripped;
  try {
    const meta = await sharp(input, { failOn: 'none' }).metadata();
    const mime = meta.format ? FORMAT_MIME[meta.format] : undefined;
    if (!mime || meta.exif || meta.xmp || meta.iptc) return null;
    return { buffer: input, contentType: mime };
  } catch {
    return null;
  }
}

const VIDEO_EXT_RE = /\.(mp4|mov|webm|m4v)$/i;

/**
 * Strip metadata from images already sitting in storage (the direct-to-storage
 * signed-URL flows, where our servers never see the bytes at upload time).
 * Re-uploads to the same path so every stored URL keeps working. Best-effort
 * per file: a failure leaves that image as uploaded, never throws.
 *
 * JPEG, PNG, WebP and AVIF are re-encoded by sharp. HEIC/HEIF, which the
 * bundled libvips can't decode, have their Exif and XMP items blanked in
 * place instead. Which path a file takes is decided by its bytes, not its
 * name or stored type, so a HEIC under a .jpg name is still caught.
 */
export async function sanitizeStoredImages(paths: string[]): Promise<void> {
  const admin = createAdminClient();
  for (const path of paths) {
    if (VIDEO_EXT_RE.test(path)) continue; // don't download 100MB videos just to skip them
    try {
      const { data, error } = await admin.storage.from(BUCKET).download(path);
      if (error || !data) continue;
      const bytes = Buffer.from(await data.arrayBuffer());
      // sharp says null for a HEIC (it can't decode HEVC), so it falls through.
      const stripped = (await stripImageMetadata(bytes)) ?? stripHeifForStorage(bytes, path, data.type);
      if (!stripped) continue;
      const { error: upErr } = await admin.storage
        .from(BUCKET)
        .upload(path, stripped.buffer, { contentType: stripped.contentType, upsert: true });
      if (upErr) logger.warn('EXIF sanitize re-upload failed', { path, error: upErr.message });
    } catch (err) {
      logger.warn('EXIF sanitize failed', { path, error: err instanceof Error ? err.message : String(err) });
    }
  }
}

/**
 * A stored HEIC/HEIF with its metadata items blanked, keeping the object's
 * content type. Null when the bytes aren't HEIF, carry no metadata, or can't
 * be patched safely (logged: that photo keeps its location). Patches `bytes`
 * in place.
 */
function stripHeifForStorage(
  bytes: Buffer,
  path: string,
  storedType: string,
): { buffer: Buffer; contentType: string } | null {
  const result = stripHeifMetadata(bytes);
  if (!result.ok) {
    if (result.reason === 'unsupported') {
      logger.warn('HEIF location could not be removed', { path, detail: result.detail });
    }
    return null;
  }
  if (result.stripped === 0) return null;
  const contentType = storedType.startsWith('image/')
    ? storedType
    : /\.(heif|hif)$/i.test(path)
      ? 'image/heif'
      : 'image/heic';
  return { buffer: bytes, contentType };
}

/** Extract the storage path from a lot-images public URL (null if not one). */
export function storagePathFromPublicUrl(url: string): string | null {
  const marker = `/storage/v1/object/public/${BUCKET}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  const path = url.slice(idx + marker.length).split('?')[0];
  return path ? decodeURIComponent(path) : null;
}
