import { describe, it, expect, vi, beforeEach } from 'vitest';
import { stripHeifMetadata, stripHeicLocation } from '../strip-heic-location';
import {
  EXIF,
  PICTURE,
  XMP,
  allZero,
  box,
  bytes,
  concat,
  heif,
  iphoneLike,
  text,
  u32,
  type HeifSpec,
  type ItemLocation,
  type Range,
} from './heif-fixtures';

/** Offsets where two buffers of the same length differ, outside `ranges`. */
function changedOutside(before: Uint8Array, after: Uint8Array, ranges: Range[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < before.length; i++) {
    if (before[i] !== after[i] && !ranges.some((r) => i >= r.start && i < r.end)) out.push(i);
  }
  return out;
}

/** Offsets of the bytes of every renamed item type ("xxxx"). */
function renamedTypeBytes(file: Uint8Array): number[] {
  return [...text(file).matchAll(/xxxx/g)].flatMap((m) => [0, 1, 2, 3].map((i) => m.index + i));
}

/** Overwrite the full-box version byte of the first box of this type. */
function setVersion(file: Uint8Array, type: string, version: number) {
  const at = text(file).indexOf(type);
  expect(at).toBeGreaterThan(0);
  file[at + 4] = version;
}

/** A spec whose Exif item's location is edited before it is written. */
function tamperExif(edit: (location: ItemLocation) => void): Partial<HeifSpec> {
  return { tamper: (locations) => edit(locations.find((l) => l.id === 2)!) };
}

function heicFile(spec: HeifSpec, name = 'IMG_0001.HEIC', type = 'image/heic'): File {
  return new File([heif(spec).file as BlobPart], name, { type, lastModified: 1_700_000_000_000 });
}

describe('stripHeifMetadata', () => {
  const layouts: { label: string; iloc: HeifSpec['iloc']; infeVersion?: 2 | 3 }[] = [
    { label: 'iloc v0, 4-byte offsets', iloc: { version: 0, offsetSize: 4, lengthSize: 4 } },
    { label: 'iloc v1, 8-byte offsets', iloc: { version: 1, offsetSize: 8, lengthSize: 4 } },
    {
      label: 'iloc v1, 8-byte offsets and lengths, base offset',
      iloc: { version: 1, offsetSize: 8, lengthSize: 8, baseOffsetSize: 4 },
    },
    {
      label: 'iloc v2 and infe v3 (32-bit item IDs)',
      iloc: { version: 2, offsetSize: 4, lengthSize: 4, baseOffsetSize: 8 },
      infeVersion: 3,
    },
  ];

  it.each(layouts)('zeroes Exif and XMP and renames their item types ($label)', ({ iloc, infeVersion }) => {
    const { file, where } = heif(iphoneLike({ iloc, infeVersion }));
    const before = file.slice();

    expect(stripHeifMetadata(file)).toEqual({ ok: true, stripped: 2 });

    expect(file.length).toBe(before.length);
    const exif = where.get(2)!;
    const xmp = where.get(3)!;
    expect(allZero(file, [...exif, ...xmp])).toBe(true);
    // The picture is byte-for-byte what it was.
    const [picture] = where.get(1)!;
    expect(file.subarray(picture.start, picture.end)).toEqual(PICTURE);
    // Outside the blanked data, only the two item types changed.
    expect(renamedTypeBytes(file)).toHaveLength(8);
    expect(changedOutside(before, file, [...exif, ...xmp])).toEqual(
      renamedTypeBytes(file).filter((i) => before[i] !== file[i]),
    );
    const s = text(file);
    expect(s).not.toContain('GPSLatitude');
    expect(s).not.toMatch(/Exif\0\0/);
    expect(s.match(/xxxx/g)).toHaveLength(2);
    expect(s).toContain('hvc1');
    expect(s).toContain('application/rdf+xml'); // the old content type is harmless
  });

  it('blanks Exif stored in idat (construction method 1)', () => {
    const spec = iphoneLike({
      mdat: [{ id: 1, data: PICTURE }, { id: 3, data: XMP }],
      idat: [{ id: 2, data: EXIF }],
    });
    const { file, where } = heif(spec);
    const before = file.slice();
    expect(text(file.subarray(where.get(2)![0].start, where.get(2)![0].end))).toContain('GPSLatitude');

    expect(stripHeifMetadata(file)).toEqual({ ok: true, stripped: 2 });
    expect(allZero(file, where.get(2)!)).toBe(true);
    expect(allZero(file, where.get(3)!)).toBe(true);
    const [picture] = where.get(1)!;
    expect(file.subarray(picture.start, picture.end)).toEqual(PICTURE);
    expect(changedOutside(before, file, [...where.get(2)!, ...where.get(3)!])).toEqual(
      renamedTypeBytes(file).filter((i) => before[i] !== file[i]),
    );
  });

  it('blanks every extent of an item split around the picture', () => {
    const { file, where } = heif(
      iphoneLike({
        mdat: [
          { id: 2, data: EXIF.subarray(0, 20) },
          { id: 1, data: PICTURE },
          { id: 2, data: EXIF.subarray(20) },
          { id: 3, data: XMP },
        ],
      }),
    );
    expect(where.get(2)).toHaveLength(2);
    expect(stripHeifMetadata(file)).toEqual({ ok: true, stripped: 2 });
    expect(allZero(file, where.get(2)!)).toBe(true);
    const [picture] = where.get(1)!;
    expect(file.subarray(picture.start, picture.end)).toEqual(PICTURE);
  });

  it('recognises XMP whatever the case of its content type, and with parameters', () => {
    const { file, where } = heif(
      iphoneLike({
        items: [
          { id: 1, type: 'hvc1' },
          { id: 2, type: 'Exif' },
          { id: 3, type: 'mime', contentType: 'Application/RDF+XML; charset=utf-8' },
        ],
      }),
    );
    expect(stripHeifMetadata(file)).toEqual({ ok: true, stripped: 2 });
    expect(allZero(file, where.get(3)!)).toBe(true);
  });

  it('returns a file without Exif or XMP unchanged', () => {
    const { file } = heif({
      items: [
        { id: 1, type: 'hvc1' },
        { id: 2, type: 'hvc1' },
        { id: 3, type: 'mime', contentType: 'application/json' },
      ],
      mdat: [
        { id: 1, data: PICTURE },
        { id: 2, data: bytes('thumbnail') },
        { id: 3, data: bytes('{"not":"xmp"}') },
      ],
    });
    const before = file.slice();
    expect(stripHeifMetadata(file)).toEqual({ ok: true, stripped: 0 });
    expect(file).toEqual(before);
  });

  it('handles a final mdat whose size is 0 ("to the end of the file")', () => {
    const { file, where } = heif(iphoneLike());
    const mdatAt = text(file).lastIndexOf('mdat') - 4;
    file.set(u32(0), mdatAt);
    expect(stripHeifMetadata(file)).toEqual({ ok: true, stripped: 2 });
    expect(allZero(file, where.get(2)!)).toBe(true);
  });

  it('fails safe, changing nothing, on truncated input', () => {
    const { file } = heif(iphoneLike());
    const metaEnd = text(file).lastIndexOf('mdat') - 4;
    for (const cut of [5, 30, metaEnd - 3, metaEnd + 4, file.length - 5]) {
      const truncated = file.slice(0, cut);
      const before = truncated.slice();
      const result = stripHeifMetadata(truncated);
      expect(result.ok, `cut at ${cut}`).toBe(false);
      expect(truncated).toEqual(before);
    }
  });

  it('fails safe when metadata would overlap the picture', () => {
    // Four bytes back: into the end of the picture's data.
    const { file } = heif(iphoneLike(tamperExif((l) => (l.extents[0][0] -= 4))));
    const before = file.slice();
    expect(stripHeifMetadata(file)).toMatchObject({ ok: false, reason: 'unsupported', detail: 'item 1 overlaps metadata' });
    expect(file).toEqual(before);
  });

  it('fails safe when metadata points into the box structure', () => {
    const { file } = heif(iphoneLike(tamperExif((l) => (l.extents[0][0] = 40)))); // inside meta
    const before = file.slice();
    expect(stripHeifMetadata(file)).toMatchObject({
      ok: false,
      reason: 'unsupported',
      detail: 'item 2 lies outside the media data',
    });
    expect(file).toEqual(before);
  });

  it('fails safe on anything else unexpected', () => {
    const cases: [RegExp, Partial<HeifSpec>, ((file: Uint8Array) => void)?][] = [
      [/iloc version 3/, {}, (f) => setVersion(f, 'iloc', 3)],
      [/infe version 1/, {}, (f) => setVersion(f, 'infe', 1)],
      [/meta version/, {}, (f) => setVersion(f, 'meta', 1)],
      [/construction method 2/, tamperExif((l) => (l.constructionMethod = 2))],
      [/outside the file/, tamperExif((l) => (l.dataReferenceIndex = 1))],
      [/end of its container/, tamperExif((l) => (l.extents[0][1] = 0))],
      [/primary item/, { primary: 2 }],
    ];
    for (const [detail, spec, edit] of cases) {
      const { file } = heif(iphoneLike(spec));
      edit?.(file);
      const before = file.slice();
      expect(stripHeifMetadata(file)).toMatchObject({ ok: false, reason: 'unsupported', detail: expect.stringMatching(detail) });
      expect(file).toEqual(before);
    }
  });

  it('says not-heif for other formats', () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0, 0x10, 0x45, 0x78, 0x69, 0x66, 0, 0]);
    const mp4 = concat(box('ftyp', bytes('isom'), u32(0), bytes('isom')), box('moov'), box('mdat', PICTURE));
    const mp4WithMeta = concat(
      box('ftyp', bytes('isom'), u32(0), bytes('isom')),
      box('meta', u32(0), box('hdlr', u32(0), u32(0), bytes('mdir'), new Uint8Array(12), bytes('\0'))),
    );
    for (const input of [jpeg, mp4, mp4WithMeta, bytes('not an image at all'), new Uint8Array(0)]) {
      expect(stripHeifMetadata(input)).toMatchObject({ ok: false, reason: 'not-heif' });
    }
  });
});

describe('stripHeicLocation', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('returns a patched copy with the same name, type and size', async () => {
    const input = heicFile(iphoneLike());
    const output = await stripHeicLocation(input);

    expect(output).not.toBe(input);
    expect(output.name).toBe('IMG_0001.HEIC');
    expect(output.type).toBe('image/heic');
    expect(output.size).toBe(input.size);
    expect(output.lastModified).toBe(input.lastModified);
    const s = text(new Uint8Array(await output.arrayBuffer()));
    expect(s).not.toContain('GPSLatitude');
    expect(s).toContain(text(PICTURE));
  });

  it('works when the picker gave no type', async () => {
    const input = heicFile(iphoneLike(), 'IMG_0002.heic', '');
    const output = await stripHeicLocation(input);
    expect(output).not.toBe(input);
    expect(text(new Uint8Array(await output.arrayBuffer()))).not.toContain('GPSLatitude');
  });

  it('returns the original file when there is nothing to strip', async () => {
    const input = heicFile({ items: [{ id: 1, type: 'hvc1' }], mdat: [{ id: 1, data: PICTURE }] });
    expect(await stripHeicLocation(input)).toBe(input);
  });

  it('returns the original file for other formats, quietly', async () => {
    const jpeg = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5]) as BlobPart], 'a.jpg', {
      type: 'image/jpeg',
    });
    expect(await stripHeicLocation(jpeg)).toBe(jpeg);
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('returns the original file, and warns, when it cannot strip safely', async () => {
    const whole = heif(iphoneLike()).file;
    const input = new File([whole.slice(0, whole.length - 5) as BlobPart], 'IMG_0003.HEIC', { type: 'image/heic' });
    expect(await stripHeicLocation(input)).toBe(input);
    expect(console.warn).toHaveBeenCalledOnce();
  });
});
