import sharp from 'sharp';
import { logger } from '@/lib/logger';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://mayells.com';

/**
 * Resolve a catalog image for use inside an Open Graph `ImageResponse`.
 *
 * Satori (the OG renderer) cannot fetch relative paths and does not decode
 * WebP — and the self-hosted catalog imagery is exactly that
 * (`/images/lots/foo.webp`), which made every generated share image 500.
 * Fetch the bytes here, normalise to JPEG, and hand back a data URL. Any
 * failure returns null so the card renders text-only instead of erroring.
 */
export async function loadOgImage(
  url: string | null | undefined,
  maxWidth = 1200,
): Promise<string | null> {
  if (!url) return null;
  try {
    const absolute = /^https?:\/\//i.test(url)
      ? url
      : `${APP_URL}${url.startsWith('/') ? '' : '/'}${url}`;
    const res = await fetch(absolute, { signal: AbortSignal.timeout(4000), cache: 'no-store' });
    if (!res.ok) return null;
    const source = Buffer.from(await res.arrayBuffer());
    const jpeg = await sharp(source, { failOn: 'none' })
      .rotate()
      .resize({ width: maxWidth, withoutEnlargement: true })
      .jpeg({ quality: 82 })
      .toBuffer();
    return `data:image/jpeg;base64,${jpeg.toString('base64')}`;
  } catch (err) {
    logger.warn('OG image load failed', { url, error: String(err) });
    return null;
  }
}
