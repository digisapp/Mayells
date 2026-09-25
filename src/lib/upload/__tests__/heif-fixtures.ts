// Synthetic HEIF files for the HEIC location tests (client and server).
// Laid out like an iPhone photo: ftyp, then meta (hdlr, pitm, iinf, idat,
// iloc), then mdat with the coded picture and the metadata items.

export function bytes(s: string): Uint8Array {
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

export function u16(n: number): Uint8Array {
  const b = new Uint8Array(2);
  new DataView(b.buffer).setUint16(0, n);
  return b;
}

export function u32(n: number): Uint8Array {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n);
  return b;
}

function u64(n: number): Uint8Array {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setBigUint64(0, BigInt(n));
  return b;
}

/** An `iloc`-style field of 0, 4 or 8 bytes. */
function uint(n: number, size: 0 | 4 | 8): Uint8Array {
  return size === 0 ? new Uint8Array(0) : size === 4 ? u32(n) : u64(n);
}

export function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

export function box(type: string, ...payload: Uint8Array[]): Uint8Array {
  const body = concat(...payload);
  return concat(u32(8 + body.length), bytes(type), body);
}

function fullBox(type: string, version: number, ...payload: Uint8Array[]): Uint8Array {
  return box(type, new Uint8Array([version, 0, 0, 0]), ...payload);
}

export const PICTURE = bytes('hevc-coded-picture-data-that-must-not-change');
export const EXIF = concat(u32(6), bytes('Exif\0\0MM\0*GPSLatitude=26.7056N;GPSLongitude=80.0364W'));
export const XMP = bytes('<x:xmpmeta><rdf:Description exif:GPSLatitude="26,42.336N"/></x:xmpmeta>');

export interface Range {
  start: number;
  end: number;
}

export interface ItemLocation {
  id: number;
  constructionMethod: number;
  dataReferenceIndex: number;
  baseOffset: number;
  /** [offset, length] */
  extents: [number, number][];
}

export interface HeifSpec {
  items: { id: number; type: string; contentType?: string }[];
  /** Media data in file order; each piece becomes one extent of its item. */
  mdat: { id: number; data: Uint8Array }[];
  /** Pieces stored in the meta box's idat (construction method 1). */
  idat?: { id: number; data: Uint8Array }[];
  iloc?: { version?: 0 | 1 | 2; offsetSize?: 0 | 4 | 8; lengthSize?: 0 | 4 | 8; baseOffsetSize?: 0 | 4 | 8 };
  infeVersion?: 2 | 3;
  primary?: number;
  /** Edit the item locations before they are written (sizes must not change). */
  tamper?: (locations: ItemLocation[]) => void;
}

/** An iPhone-like photo: the picture, an Exif item and an XMP item. */
export function iphoneLike(overrides: Partial<HeifSpec> = {}): HeifSpec {
  return {
    items: [
      { id: 1, type: 'hvc1' },
      { id: 2, type: 'Exif' },
      { id: 3, type: 'mime', contentType: 'application/rdf+xml' },
    ],
    mdat: [
      { id: 1, data: PICTURE },
      { id: 2, data: EXIF },
      { id: 3, data: XMP },
    ],
    ...overrides,
  };
}

/** Build the file, and say where each item's data landed. */
export function heif(spec: HeifSpec): { file: Uint8Array; where: Map<number, Range[]> } {
  const { version = 1, offsetSize = 4, lengthSize = 4, baseOffsetSize = 0 } = spec.iloc ?? {};
  const infeVersion = spec.infeVersion ?? 2;
  const ftyp = box('ftyp', bytes('heic'), u32(0), bytes('mif1heic'));

  const buildMeta = (mdatStart: number) => {
    const where = new Map<number, Range[]>();
    const locations: ItemLocation[] = [];
    const place = (id: number, constructionMethod: number, base: number, offset: number, length: number, absolute: number) => {
      let loc = locations.find((l) => l.id === id);
      if (!loc) {
        loc = { id, constructionMethod, dataReferenceIndex: 0, baseOffset: baseOffsetSize ? base : 0, extents: [] };
        locations.push(loc);
      }
      loc.extents.push([baseOffsetSize ? offset - base : offset, length]);
      where.set(id, [...(where.get(id) ?? []), { start: absolute, end: absolute + length }]);
    };

    const hdlr = fullBox('hdlr', 0, u32(0), bytes('pict'), new Uint8Array(12), bytes('\0'));
    const pitm = fullBox('pitm', 0, u16(spec.primary ?? 1));
    const iinf = fullBox(
      'iinf',
      0,
      u16(spec.items.length),
      ...spec.items.map((item) =>
        fullBox(
          'infe',
          infeVersion,
          infeVersion === 2 ? u16(item.id) : u32(item.id),
          u16(0),
          bytes(item.type),
          bytes('\0'),
          item.contentType === undefined ? new Uint8Array(0) : bytes(`${item.contentType}\0`),
        ),
      ),
    );
    const idat = spec.idat ? box('idat', ...spec.idat.map((p) => p.data)) : new Uint8Array(0);
    // meta header (12) + children before idat + idat header (8)
    const idatStart = ftyp.length + 12 + hdlr.length + pitm.length + iinf.length + 8;

    let at = mdatStart;
    for (const piece of spec.mdat) {
      place(piece.id, 0, mdatStart, at, piece.data.length, at);
      at += piece.data.length;
    }
    at = 0;
    for (const piece of spec.idat ?? []) {
      place(piece.id, 1, 0, at, piece.data.length, idatStart + at);
      at += piece.data.length;
    }
    spec.tamper?.(locations);

    const iloc = fullBox(
      'iloc',
      version,
      new Uint8Array([(offsetSize << 4) | lengthSize, baseOffsetSize << 4]),
      version < 2 ? u16(locations.length) : u32(locations.length),
      ...locations.flatMap((loc) => [
        version < 2 ? u16(loc.id) : u32(loc.id),
        version >= 1 ? u16(loc.constructionMethod) : new Uint8Array(0),
        u16(loc.dataReferenceIndex),
        uint(loc.baseOffset, baseOffsetSize),
        u16(loc.extents.length),
        ...loc.extents.flatMap(([offset, length]) => [uint(offset, offsetSize), uint(length, lengthSize)]),
      ]),
    );
    return { meta: fullBox('meta', 0, hdlr, pitm, iinf, idat, iloc), where };
  };

  // Offsets are fixed-width, so the meta box is the same size either way.
  const mdatStart = ftyp.length + buildMeta(0).meta.length + 8;
  const { meta, where } = buildMeta(mdatStart);
  const mdat = box('mdat', ...spec.mdat.map((p) => p.data));
  return { file: concat(ftyp, meta, mdat), where };
}

/** Every byte in the ranges is zero. */
export function allZero(buf: Uint8Array, ranges: Range[]): boolean {
  return ranges.every(({ start, end }) => buf.subarray(start, end).every((b) => b === 0));
}

export function text(buf: Uint8Array): string {
  return String.fromCharCode(...buf);
}
