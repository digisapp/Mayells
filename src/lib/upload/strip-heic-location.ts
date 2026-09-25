import { logger } from '@/lib/logger';
import { type BoxSpan, childrenOf, fourcc, latin1, readBox, writeFourcc } from './iso-bmff';

/** What stripping did. On any failure the bytes are exactly as they were. */
export type HeifStripResult =
  /** `stripped` metadata items were neutralised; 0 means there were none and nothing changed. */
  | { ok: true; stripped: number }
  /**
   * Nothing was changed. `not-heif`: some other format. `unsupported`: a
   * HEIF (or damaged file) this can't patch safely.
   */
  | { ok: false; reason: 'not-heif' | 'unsupported'; detail: string };

/**
 * Remove location (and all other Exif/XMP) from a HEIC/HEIF photo, in place,
 * without re-encoding it. Pure; the server uses it directly.
 *
 * The phone normally converts HEIC to JPEG through a canvas, which drops all
 * metadata. When it can't (desktop Chrome and Firefox can't decode HEIC, and
 * iOS sometimes fails or runs out of time), the original would reach the
 * public bucket with the seller's GPS position in its Exif, and the server's
 * sharp can't decode HEVC to scrub it either.
 *
 * A HEIF file lists its metadata as items in the top-level `meta` box: `iinf`
 * says what each item is, `iloc` where its bytes are. Every Exif item and
 * every XMP item has its bytes zeroed and its type renamed to one no reader
 * knows, so readers skip it. No box size or offset changes, and the picture's
 * own items stay byte-for-byte identical. The whole structure is checked
 * before a single byte is written, so a file this can't patch safely comes
 * back exactly as it was, with the reason.
 */
export function stripHeifMetadata(bytes: Uint8Array): HeifStripResult {
  let plan: StripPlan;
  try {
    plan = planStrip(bytes);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: err instanceof NotHeif ? 'not-heif' : 'unsupported', detail };
  }
  // Every check has passed; only now is anything written.
  for (const at of plan.typeOffsets) writeFourcc(bytes, at, NEUTRAL_ITEM_TYPE);
  for (const { start, end } of plan.ranges) bytes.fill(0, start, end);
  return { ok: true, stripped: plan.typeOffsets.length };
}

/**
 * The same for a file in the browser, for a HEIC the phone couldn't
 * re-encode. Resolves with a patched copy, or with the original when there is
 * nothing to strip or it can't be done safely. Never rejects.
 */
export async function stripHeicLocation(file: File): Promise<File> {
  try {
    if (file.size > MAX_READ_BYTES) return file;
    // Sniff first, so a TIFF or GIF that fell back too isn't read whole for nothing.
    const head = new Uint8Array(await file.slice(0, 8).arrayBuffer());
    if (head.length < 8 || fourcc(head, 4) !== 'ftyp') return file;

    // A phone photo is a few MB, so reading it whole is fine; the metadata
    // sits at both ends of it (item table first, Exif inside the media data).
    const bytes = new Uint8Array(await file.arrayBuffer());
    const result = stripHeifMetadata(bytes);
    if (!result.ok) {
      if (result.reason === 'unsupported') {
        logger.warn('Could not strip HEIC location; uploading unchanged', { detail: result.detail, size: file.size });
      }
      return file;
    }
    if (result.stripped === 0) return file;
    return new File([bytes], file.name, { type: file.type, lastModified: file.lastModified });
  } catch (err) {
    logger.warn('Could not strip HEIC location; uploading unchanged', {
      error: err instanceof Error ? err.message : String(err),
      size: file.size,
    });
    return file;
  }
}

/** What a neutralised item's type becomes: no reader knows it, so every reader skips it. */
const NEUTRAL_ITEM_TYPE = 'xxxx';
const XMP_CONTENT_TYPE = 'application/rdf+xml';
// Well above any phone photo; the upload routes refuse anything over 15 MB anyway.
const MAX_READ_BYTES = 64 * 1024 * 1024;
// Apple writes about 120 items with one extent each. Bounds the work a
// hostile item table (extents of zero-byte fields) can ask of the server.
const MAX_EXTENTS = 100_000;

class NotHeif extends Error {}

interface Range {
  start: number;
  end: number;
}

interface StripPlan {
  /** Where each metadata item's item_type sits in its `infe`. */
  typeOffsets: number[];
  /** The file ranges holding those items' data. */
  ranges: Range[];
}

interface ItemInfo {
  id: number;
  type: string;
  typeOffset: number;
  /** For `mime` items; empty otherwise. */
  contentType: string;
}

interface ItemLocation {
  constructionMethod: number;
  dataReferenceIndex: number;
  baseOffset: number;
  extents: { offset: number; length: number }[];
}

/** Read and check everything, and say what to overwrite. Throws on anything unexpected. */
function planStrip(buf: Uint8Array): StripPlan {
  if (buf.length < 8 || fourcc(buf, 4) !== 'ftyp') throw new NotHeif('no ftyp box');
  const top = topLevelBoxes(buf);
  const metas = top.filter((box) => box.type === 'meta');
  if (metas.length === 0) throw new NotHeif('no meta box');
  if (metas.length > 1) throw new Error('more than one meta box');
  const meta = metas[0];

  // A full box, version 0 (the only one defined), then its children.
  const meta0 = new Cursor(buf, meta.start + meta.headerSize, meta.end);
  if (meta0.version() !== 0) throw new Error('unknown meta version');
  const children = childrenOf(buf, meta0.at, meta.end, { strict: true });
  const only = (type: string): BoxSpan | undefined => {
    const found = children.filter((box) => box.type === type);
    if (found.length > 1) throw new Error(`more than one ${type} box`);
    return found[0];
  };

  // An image file's meta is handled as 'pict'; an MP4's top-level meta isn't.
  const hdlr = only('hdlr');
  if (!hdlr) throw new NotHeif('meta box without a handler');
  const handler = new Cursor(buf, hdlr.start + hdlr.headerSize, hdlr.end);
  handler.version();
  handler.u32(); // pre_defined
  if (handler.fourcc() !== 'pict') throw new NotHeif('not an image file');

  const iinf = only('iinf');
  const targets = (iinf ? readItemInfos(buf, iinf) : []).filter(isMetadataItem);
  if (targets.length === 0) return { typeOffsets: [], ranges: [] };

  const iloc = only('iloc');
  if (!iloc) throw new Error('no iloc box');
  const locations = readItemLocations(buf, iloc);
  const pitm = only('pitm');
  const primary = pitm ? readPrimaryItem(buf, pitm) : null;
  const idatBox = only('idat');
  const idat = idatBox ? { start: idatBox.start + idatBox.headerSize, end: idatBox.end } : null;

  // Metadata may only be blanked where media data lives, never in the box
  // structure: inside an mdat, or inside the meta box's own idat.
  const dataAreas: Range[] = top
    .filter((box) => box.type === 'mdat')
    .map((box) => ({ start: box.start + box.headerSize, end: box.end }));
  if (idat) dataAreas.push(idat);

  const ranges: Range[] = [];
  for (const item of targets) {
    if (item.id === primary) throw new Error(`primary item ${item.id} is metadata`);
    const location = locations.get(item.id);
    if (!location) throw new Error(`item ${item.id} has no location`);
    if (location.dataReferenceIndex !== 0) throw new Error(`item ${item.id} is stored outside the file`);
    for (const range of resolveExtents(location, buf.length, idat)) {
      if (range.openEnded) throw new Error(`item ${item.id} runs to the end of its container`);
      if (!dataAreas.some((area) => range.start >= area.start && range.end <= area.end)) {
        throw new Error(`item ${item.id} lies outside the media data`);
      }
      ranges.push(range);
    }
  }

  // Blanking must never reach another item's bytes: that would be the picture.
  const targetIds = new Set(targets.map((item) => item.id));
  for (const [id, location] of locations) {
    if (targetIds.has(id)) continue;
    for (const other of resolveExtents(location, buf.length, idat)) {
      if (ranges.some((range) => range.start < other.end && other.start < range.end)) {
        throw new Error(`item ${id} overlaps metadata`);
      }
    }
  }

  return { typeOffsets: targets.map((item) => item.typeOffset), ranges };
}

/** Top-level boxes; the last may have size 0, meaning "to the end of the file". */
function topLevelBoxes(buf: Uint8Array): BoxSpan[] {
  const out: BoxSpan[] = [];
  for (let at = 0; at < buf.length; ) {
    const box = readBox(buf, at, buf.length, true);
    if (!box) throw new Error(`malformed box at ${at}`);
    const end = box.end === box.start ? buf.length : box.end;
    if (end > buf.length) throw new Error(`box at ${at} overruns the file`);
    out.push({ ...box, end });
    at = end;
  }
  return out;
}

function isMetadataItem(item: ItemInfo): boolean {
  if (item.type === 'Exif') return true;
  // XMP is a `mime` item; its content type may carry parameters.
  return item.type === 'mime' && item.contentType.split(';')[0].trim().toLowerCase() === XMP_CONTENT_TYPE;
}

/** The `infe` entries of an `iinf` box. */
function readItemInfos(buf: Uint8Array, iinf: BoxSpan): ItemInfo[] {
  const r = new Cursor(buf, iinf.start + iinf.headerSize, iinf.end);
  const count = r.version() === 0 ? r.u16() : r.u32();
  const entries = childrenOf(buf, r.at, iinf.end, { strict: true });
  if (entries.length !== count || entries.some((box) => box.type !== 'infe')) {
    throw new Error('unexpected item info list');
  }

  const seen = new Set<number>();
  return entries.map((infe) => {
    const e = new Cursor(buf, infe.start + infe.headerSize, infe.end);
    const version = e.version();
    // Versions 0 and 1 predate item types; HEIF requires 2 or 3.
    if (version !== 2 && version !== 3) throw new Error(`infe version ${version}`);
    const id = version === 2 ? e.u16() : e.u32();
    e.u16(); // item_protection_index
    const typeOffset = e.at;
    const type = e.fourcc();
    e.cstring(); // item_name
    const contentType = type === 'mime' ? e.cstring() : '';
    if (seen.has(id)) throw new Error(`duplicate item ${id}`);
    seen.add(id);
    return { id, type, typeOffset, contentType };
  });
}

/** Where each item's data is, from an `iloc` box (versions 0–2). */
function readItemLocations(buf: Uint8Array, iloc: BoxSpan): Map<number, ItemLocation> {
  const r = new Cursor(buf, iloc.start + iloc.headerSize, iloc.end);
  const version = r.version();
  if (version > 2) throw new Error(`iloc version ${version}`);
  const sizes = r.u8();
  const moreSizes = r.u8();
  const offsetSize = sizes >> 4;
  const lengthSize = sizes & 0xf;
  const baseOffsetSize = moreSizes >> 4;
  // The low nibble is index_size from version 1 on, reserved before it.
  const indexSize = version >= 1 ? moreSizes & 0xf : 0;
  for (const size of [offsetSize, lengthSize, baseOffsetSize, indexSize]) {
    if (size !== 0 && size !== 4 && size !== 8) throw new Error(`iloc field size ${size}`);
  }

  const out = new Map<number, ItemLocation>();
  const count = version < 2 ? r.u16() : r.u32();
  let totalExtents = 0;
  for (let i = 0; i < count; i++) {
    const id = version < 2 ? r.u16() : r.u32();
    // 12 reserved bits, then construction_method (versions 1 and 2 only).
    const constructionMethod = version >= 1 ? r.u16() & 0xf : 0;
    const dataReferenceIndex = r.u16();
    const baseOffset = r.uint(baseOffsetSize);
    const extentCount = r.u16();
    totalExtents += extentCount;
    if (totalExtents > MAX_EXTENTS) throw new Error('too many extents');
    const extents: ItemLocation['extents'] = [];
    for (let e = 0; e < extentCount; e++) {
      r.uint(indexSize); // extent_index: only used by construction method 2
      const offset = r.uint(offsetSize);
      extents.push({ offset, length: r.uint(lengthSize) });
    }
    if (out.has(id)) throw new Error(`duplicate location for item ${id}`);
    out.set(id, { constructionMethod, dataReferenceIndex, baseOffset, extents });
  }
  return out;
}

function readPrimaryItem(buf: Uint8Array, pitm: BoxSpan): number {
  const r = new Cursor(buf, pitm.start + pitm.headerSize, pitm.end);
  return r.version() === 0 ? r.u16() : r.u32();
}

/**
 * An item's extents as file ranges. A length of 0 means "the rest of the
 * container" (the file, or idat): fine to guard another item's bytes with,
 * never something to blank.
 */
function resolveExtents(
  location: ItemLocation,
  fileSize: number,
  idat: Range | null,
): (Range & { openEnded: boolean })[] {
  let container: Range;
  if (location.constructionMethod === 0) {
    container = { start: 0, end: fileSize }; // offsets into the file
  } else if (location.constructionMethod === 1) {
    if (!idat) throw new Error('item in idat, but there is no idat box');
    container = idat; // offsets into the idat box's data
  } else {
    // 2 builds an item from pieces of other items: nothing a camera writes.
    throw new Error(`construction method ${location.constructionMethod}`);
  }
  return location.extents.map(({ offset, length }) => {
    const start = container.start + location.baseOffset + offset;
    const end = length === 0 ? container.end : start + length;
    if (start > container.end || end > container.end) throw new Error('extent runs past its container');
    return { start, end, openEnded: length === 0 };
  });
}

/** Bounds-checked big-endian reads within one box. */
class Cursor {
  at: number;
  private readonly buf: Uint8Array;
  private readonly end: number;
  private readonly view: DataView;

  constructor(buf: Uint8Array, start: number, end: number) {
    this.buf = buf;
    this.at = start;
    this.end = end;
    this.view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  }

  private take(n: number): number {
    if (this.at + n > this.end) throw new Error('truncated box');
    const at = this.at;
    this.at += n;
    return at;
  }

  u8(): number {
    return this.buf[this.take(1)];
  }

  u16(): number {
    return this.view.getUint16(this.take(2));
  }

  u32(): number {
    return this.view.getUint32(this.take(4));
  }

  /** A 0-, 4- or 8-byte unsigned field, as `iloc` sizes them. */
  uint(size: number): number {
    if (size === 0) return 0;
    if (size === 4) return this.u32();
    const value = this.view.getBigUint64(this.take(8));
    if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('offset too large');
    return Number(value);
  }

  fourcc(): string {
    return fourcc(this.buf, this.take(4));
  }

  /** A full box's version; its flags are skipped. */
  version(): number {
    const version = this.u8();
    this.take(3);
    return version;
  }

  /** A NUL-terminated string; one missing its terminator ends at the box end. */
  cstring(): string {
    const start = this.at;
    let end = start;
    while (end < this.end && this.buf[end] !== 0) end++;
    this.at = Math.min(end + 1, this.end);
    return latin1(this.buf, start, end);
  }
}
