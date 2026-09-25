import { logger } from '@/lib/logger';
import { type BoxSpan, childrenOf, latin1, readBox, writeFourcc } from './iso-bmff';
import { uploadContentType } from './limits';

/**
 * Remove GPS location from a phone video (MOV/MP4) before it is uploaded.
 *
 * iPhones write where a video was shot into the QuickTime metadata: an
 * ISO 6709 string in `moov/meta` (keys + ilst) and, in older files and on
 * Android, a `©xyz` box in `moov/udta`. The server's scrubber only handles
 * still images, so without this a seller's home address would ride along
 * with every video.
 *
 * The file is never loaded whole. Only top-level box headers are read (via
 * Blob.slice) until `moov` is found, then just that box. Location is
 * neutralised in place without changing any box size, so every sample
 * offset in the file stays valid, and the result is stitched back together
 * from slices of the original. Anything unexpected returns the original
 * file untouched: a video that keeps its metadata is better than one that
 * no longer plays.
 */
export async function stripVideoLocation(file: File): Promise<File> {
  // ISO-BMFF only. WebM is a different container, and phones don't record it.
  if (!/^video\/(quicktime|mp4)$/.test(uploadContentType(file))) return file;
  try {
    const moov = await findTopLevelBox(file, 'moov');
    if (!moov) return file;
    if (moov.end - moov.start > MAX_MOOV_BYTES) {
      logger.warn('Video metadata too large to scan; uploading unchanged', { size: moov.end - moov.start });
      return file;
    }

    const bytes = new Uint8Array(await file.slice(moov.start, moov.end).arrayBuffer());
    if (bytes.length !== moov.end - moov.start) throw new Error('short read');
    if (patchMoov(bytes) === 0) return file;

    return new File([file.slice(0, moov.start), bytes, file.slice(moov.end)], file.name, {
      type: file.type,
      lastModified: file.lastModified,
    });
  } catch (err) {
    logger.warn('Could not strip video location; uploading unchanged', {
      error: err instanceof Error ? err.message : String(err),
      type: file.type,
      size: file.size,
    });
    return file;
  }
}

// A few minutes of 4K is well under this; anything bigger is not a phone video.
const MAX_MOOV_BYTES = 64 * 1024 * 1024;
const MAX_TOP_LEVEL_BOXES = 10_000;

async function findTopLevelBox(file: Blob, wanted: string): Promise<BoxSpan | null> {
  let offset = 0;
  for (let count = 0; offset < file.size; count++) {
    if (count > MAX_TOP_LEVEL_BOXES) throw new Error('too many top-level boxes');
    const header = new Uint8Array(await file.slice(offset, offset + 16).arrayBuffer());
    const box = readBox(header, 0, header.length, true);
    if (!box) throw new Error(`malformed box at ${offset}`);
    let size = box.end - box.start;
    // A size of 0 means "runs to the end of the file".
    if (size === 0) size = file.size - offset;
    if (size < box.headerSize || offset + size > file.size) throw new Error(`box at ${offset} overruns the file`);
    if (box.type === wanted) return { type: wanted, start: offset, headerSize: box.headerSize, end: offset + size };
    offset += size;
  }
  return null;
}

/** Turn a box into padding: players skip `free`, and its old bytes are zeroed. */
function freeBox(buf: Uint8Array, box: BoxSpan) {
  writeFourcc(buf, box.start + 4, 'free');
  buf.fill(0, box.start + box.headerSize, box.end);
}

// Apple's "com.apple.quicktime.location.ISO6709" (and .name, .accuracy.*,
// ...), plus the bare "location" / "location-eng" other tools write.
const LOCATION_KEY = /(^|\.)location([.-]|$)|iso6709/i;
const REDACTED = 'redacted'; // same length as "location", so the key box keeps its size

/**
 * Neutralise every location record inside a `moov` box, in place. Returns
 * how many were found. Exported for tests.
 */
export function patchMoov(moov: Uint8Array): number {
  const root = readBox(moov, 0, moov.length);
  if (!root || root.type !== 'moov' || root.end !== moov.length) throw new Error('not a moov box');
  return patchContainer(moov, root);
}

function patchContainer(buf: Uint8Array, container: BoxSpan): number {
  let patched = 0;
  for (const box of childrenOf(buf, container.start + container.headerSize, container.end)) {
    switch (box.type) {
      case 'trak':
      case 'udta':
        patched += patchContainer(buf, box);
        break;
      case 'meta':
        patched += patchMeta(buf, box);
        break;
      case '©xyz': // QuickTime/Android user-data location
      case 'loci': // 3GPP location information
        freeBox(buf, box);
        patched++;
        break;
      case 'XMP_':
        if (container.type === 'udta' && containsAscii(buf, box, 'GPS')) {
          freeBox(buf, box);
          patched++;
        }
        break;
    }
  }
  return patched;
}

function patchMeta(buf: Uint8Array, meta: BoxSpan): number {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  // QuickTime's `meta` is a plain box; ISO MP4's is a full box with four
  // bytes of version/flags first. A plain box starts with a child's size,
  // which is never zero.
  const bodyStart = meta.start + meta.headerSize;
  const childStart = bodyStart + 4 <= meta.end && view.getUint32(bodyStart) === 0 ? bodyStart + 4 : bodyStart;
  const children = childrenOf(buf, childStart, meta.end);

  const keys = children.find((box) => box.type === 'keys');
  const locationIndexes = keys ? redactLocationKeys(buf, keys) : new Set<number>();
  let patched = locationIndexes.size;

  const ilst = children.find((box) => box.type === 'ilst');
  if (!ilst) return patched;
  for (const item of childrenOf(buf, ilst.start + ilst.headerSize, ilst.end)) {
    // In a keyed (mdta) list each item's type is its 1-based key index; in
    // an iTunes-style list it is a four-character code such as ©xyz.
    const index = view.getUint32(item.start + 4);
    if (locationIndexes.has(index) || item.type === '©xyz') {
      patched += blankDataValues(buf, item);
    }
  }
  return patched;
}

/** Rename location keys in a `keys` box and return their 1-based indexes. */
function redactLocationKeys(buf: Uint8Array, keys: BoxSpan): Set<number> {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const found = new Set<number>();
  // Full box: version/flags, then entry_count.
  let at = keys.start + keys.headerSize + 4;
  if (at + 4 > keys.end) throw new Error('short keys box');
  const count = view.getUint32(at);
  at += 4;
  for (let index = 1; index <= count; index++) {
    if (at + 8 > keys.end) throw new Error('short keys entry');
    const size = view.getUint32(at);
    if (size < 8 || at + size > keys.end) throw new Error('malformed keys entry');
    const name = latin1(buf, at + 8, at + size);
    if (LOCATION_KEY.test(name)) {
      found.add(index);
      const pos = name.toLowerCase().indexOf('location');
      if (pos >= 0) {
        for (let i = 0; i < REDACTED.length; i++) buf[at + 8 + pos + i] = REDACTED.charCodeAt(i);
      }
    }
    at += size;
  }
  return found;
}

/** Overwrite the payload of every `data` box in an ilst item, keeping sizes. */
function blankDataValues(buf: Uint8Array, item: BoxSpan): number {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let blanked = 0;
  for (const data of childrenOf(buf, item.start + item.headerSize, item.end)) {
    if (data.type !== 'data') continue;
    // data box: 4-byte type indicator (well-known type in the low 24 bits),
    // 4-byte locale, then the value.
    const valueStart = data.start + data.headerSize + 8;
    if (valueStart > data.end) throw new Error('short data box');
    const isUtf8 = (view.getUint32(data.start + data.headerSize) & 0xffffff) === 1;
    buf.fill(isUtf8 ? 0x20 : 0x00, valueStart, data.end);
    blanked++;
  }
  return blanked;
}

function containsAscii(buf: Uint8Array, box: BoxSpan, needle: string): boolean {
  return latin1(buf, box.start + box.headerSize, box.end).includes(needle);
}
