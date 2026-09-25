// Which photos must be re-encoded on the device before upload.
//
// Re-encoding through a canvas drops all metadata, including the GPS position
// of the seller's home. The server scrubs EXIF again once photos are attached
// to a lead or an upload link (src/lib/images/sanitize.ts), but sharp there
// only re-encodes JPEG, PNG, WebP and AVIF. A HEIC can only have its Exif and
// XMP items blanked in place (strip-heic-location.ts, also run on the phone
// when conversion fails), and any other format keeps its metadata. So
// anything outside the formats sharp can scrub is always converted here,
// whatever its size.

export type ReencodePolicy =
  /** Small JPEG/PNG/WebP: light enough already, and the server scrubs its metadata. */
  | 'keep'
  /** Large JPEG/PNG/WebP: re-encode to save upload time; keep the original if that isn't smaller. */
  | 'shrink'
  /** HEIC/HEIF and anything else: always re-encode to JPEG, even if the result is larger. */
  | 'convert';

/** Files at or under this size are uploaded as they are (when the server can scrub them). */
export const SMALL_PHOTO_BYTES = 500 * 1024;

const SERVER_SCRUBBED_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/pjpeg', 'image/png', 'image/webp']);
const SERVER_SCRUBBED_EXT = new Set(['jpg', 'jpeg', 'jfif', 'png', 'webp']);

export function reencodePolicy(
  file: { name: string; type: string; size: number },
  smallBytes = SMALL_PHOTO_BYTES,
): ReencodePolicy {
  const type = file.type.toLowerCase();
  // A video (the seller upload flow takes those too) isn't ours to touch. Any
  // other type is decoded if it can be: a HEIC can arrive as octet-stream.
  if (/^(video|audio)\//.test(type)) return 'keep';

  // The type must be one the server scrubs, and the name mustn't contradict
  // it: a HEIC can arrive with an empty or generic type, and a mislabelled
  // one would slip past a type-only check.
  const ext = /\.([a-z0-9]+)$/i.exec(file.name)?.[1].toLowerCase();
  const scrubbable = SERVER_SCRUBBED_TYPES.has(type) && (!ext || SERVER_SCRUBBED_EXT.has(ext));
  if (!scrubbable) return 'convert';

  return file.size <= smallBytes ? 'keep' : 'shrink';
}
