import { supabaseUrl } from '@/lib/supabase/env';

const BUCKET = 'lot-images';
const OBJECT_MARKER = `/storage/v1/object/public/${BUCKET}/`;
const RENDER_MARKER = `/storage/v1/render/image/public/${BUCKET}/`;

function projectOrigin(): string | null {
  const base = supabaseUrl();
  if (!base) return null;
  try {
    return new URL(base).origin;
  } catch {
    return null;
  }
}

/**
 * Extract the storage path from a lot-images public URL (null if not one).
 *
 * Only this project's own storage counts: the URL's origin must be the
 * project's Supabase origin and its path must begin with the bucket's public
 * prefix. Matching the prefix anywhere would let another Supabase project
 * (`https://attacker.supabase.co/storage/v1/object/public/lot-images/…`)
 * pass for one of our objects.
 */
export function storagePathFromPublicUrl(url: string): string | null {
  const origin = projectOrigin();
  if (!origin) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.origin !== origin || !parsed.pathname.startsWith(OBJECT_MARKER)) return null;
  const encoded = parsed.pathname.slice(OBJECT_MARKER.length);
  if (!encoded) return null;
  try {
    return decodeURIComponent(encoded);
  } catch {
    return null;
  }
}

/**
 * A downscaled, re-encoded rendition of one of our lot-images objects, via
 * Supabase image transforms (null for any other URL). The vision models
 * can't read HEIC; the rendition comes back in a format they can.
 */
export function renditionUrl(url: string, width = 1600): string | null {
  if (!storagePathFromPublicUrl(url)) return null;
  const parsed = new URL(url);
  parsed.pathname = RENDER_MARKER + parsed.pathname.slice(OBJECT_MARKER.length);
  parsed.search = `?width=${width}&quality=80`;
  parsed.hash = '';
  return parsed.toString();
}
