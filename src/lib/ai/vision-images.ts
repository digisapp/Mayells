import { renditionUrl } from '@/lib/images/storage-url';

// Sellers can attach clips next to their photos; the vision models take
// stills only, and a video sent as an image part fails the whole request.
const VIDEO_RE = /\.(mp4|mov|webm|m4v|avi|mkv)$/i;
// iPhone originals. The models can't decode HEIC, so these go through the
// storage image transform, which re-encodes them.
const HEIF_RE = /\.(heic|heif|hif)$/i;

function pathnameOf(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url.split(/[?#]/)[0];
  }
}

export function isVideoUrl(url: string): boolean {
  return VIDEO_RE.test(pathnameOf(url));
}

/** Thrown when every URL handed to a vision call is a video. */
export class NoStillImagesError extends Error {
  constructor() {
    super('No photos to analyze: the vision model reads stills only, and every file is a video.');
    this.name = 'NoStillImagesError';
  }
}

/**
 * The URLs a vision call should send, in order: videos dropped, and our own
 * HEIC photos swapped for a rendition the model can read. Other stills go as
 * they are.
 */
export function visionImageUrls(urls: string[]): string[] {
  return urls
    .filter((url) => !isVideoUrl(url))
    .map((url) => (HEIF_RE.test(pathnameOf(url)) ? renditionUrl(url) ?? url : url));
}

/** Image parts for a vision prompt. Throws NoStillImagesError when there are none. */
export function visionImageParts(urls: string[]) {
  const stills = visionImageUrls(urls);
  if (stills.length === 0) throw new NoStillImagesError();
  return stills.map((url) => ({ type: 'image' as const, image: new URL(url) }));
}
