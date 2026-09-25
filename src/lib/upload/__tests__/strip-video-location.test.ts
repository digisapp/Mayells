import { describe, it, expect, vi, beforeEach } from 'vitest';
import { stripVideoLocation, patchMoov } from '../strip-video-location';

// ── Synthetic ISO-BMFF builders ─────────────────────────────────────────

function bytes(s: string): Uint8Array {
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

function u32(n: number): Uint8Array {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n);
  return b;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

function box(type: string, ...payload: Uint8Array[]): Uint8Array {
  const body = concat(...payload);
  return concat(u32(8 + body.length), bytes(type), body);
}

/** A box written with the 64-bit largesize form. */
function largeBox(type: string, ...payload: Uint8Array[]): Uint8Array {
  const body = concat(...payload);
  const header = new Uint8Array(16);
  const view = new DataView(header.buffer);
  view.setUint32(0, 1);
  header.set(bytes(type), 4);
  view.setBigUint64(8, BigInt(16 + body.length));
  return concat(header, body);
}

const FLAGS = u32(0); // full-box version + flags

function keyEntry(name: string): Uint8Array {
  return concat(u32(8 + name.length), bytes('mdta'), bytes(name));
}

function dataBox(typeIndicator: number, value: Uint8Array): Uint8Array {
  return box('data', u32(typeIndicator), u32(0), value);
}

const ISO6709 = '+26.7056-080.0364+004.123/';
const ftyp = box('ftyp', bytes('qt  '), u32(0), bytes('qt  '));
const mdat = box('mdat', bytes('frame-data-that-must-not-change'));
const mvhd = box('mvhd', new Uint8Array(20).fill(7));

function udtaWithXyz(): Uint8Array {
  // ©xyz payload: 16-bit length, 16-bit language, then the string.
  const xyz = concat(new Uint8Array([0, ISO6709.length, 0x15, 0xc7]), bytes(ISO6709));
  return box('udta', box('©xyz', xyz), box('©mak', bytes('Apple')), u32(0));
}

function quickTimeMeta({ fullBox = false } = {}): Uint8Array {
  const hdlr = box('hdlr', FLAGS, u32(0), bytes('mdta'), new Uint8Array(12), new Uint8Array([0]));
  const keys = box(
    'keys',
    FLAGS,
    u32(3),
    keyEntry('com.apple.quicktime.make'),
    keyEntry('com.apple.quicktime.location.ISO6709'),
    keyEntry('com.apple.quicktime.location.accuracy.horizontal'),
  );
  const ilst = box(
    'ilst',
    concat(u32(8 + 8 + 8 + 5), u32(1), dataBox(1, bytes('Apple'))),
    concat(u32(8 + 8 + 8 + ISO6709.length), u32(2), dataBox(1, bytes(ISO6709))),
    concat(u32(8 + 8 + 8 + 4), u32(3), dataBox(23, new Uint8Array([0x41, 0x20, 0, 0]))),
  );
  return fullBox ? box('meta', FLAGS, hdlr, keys, ilst) : box('meta', hdlr, keys, ilst);
}

function moov(...children: Uint8Array[]): Uint8Array {
  return box('moov', mvhd, box('trak', box('tkhd', new Uint8Array(8))), ...children);
}

function file(...parts: Uint8Array[]): File {
  return new File([concat(...parts) as BlobPart], 'IMG_0001.MOV', { type: 'video/quicktime' });
}

async function contents(f: Blob): Promise<string> {
  return String.fromCharCode(...new Uint8Array(await f.arrayBuffer()));
}

// ── Tests ───────────────────────────────────────────────────────────────

describe('stripVideoLocation', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('turns a udta ©xyz box into zeroed free space without changing the file size', async () => {
    const input = file(ftyp, moov(udtaWithXyz()), mdat);
    const output = await stripVideoLocation(input);

    expect(output).not.toBe(input);
    expect(output.size).toBe(input.size);
    expect(output.type).toBe('video/quicktime');
    expect(output.name).toBe('IMG_0001.MOV');
    const text = await contents(output);
    expect(text).not.toContain('©xyz');
    expect(text).not.toContain(ISO6709);
    expect(text).toContain('free');
    // Other user data is left alone.
    expect(text).toContain('©makApple');
  });

  it('redacts location keys in moov/meta and blanks their ilst values', async () => {
    const input = file(ftyp, moov(quickTimeMeta()), mdat);
    const output = await stripVideoLocation(input);
    const text = await contents(output);

    expect(output.size).toBe(input.size);
    expect(text).not.toContain(ISO6709);
    expect(text).not.toContain('quicktime.location');
    expect(text).toContain('com.apple.quicktime.redacted.ISO6709');
    expect(text).toContain('com.apple.quicktime.redacted.accuracy.horizontal');
    // The non-location key and its value survive.
    expect(text).toContain('com.apple.quicktime.make');
    expect(text).toContain('Apple');
    // The float accuracy value is zeroed rather than space-filled.
    expect(text).not.toContain('A \u0000\u0000');
  });

  it('also catches the bare "location" keys other tools (ffmpeg) write', async () => {
    const meta = box(
      'meta',
      box('hdlr', FLAGS, u32(0), bytes('mdta'), new Uint8Array(12), new Uint8Array([0])),
      box('keys', FLAGS, u32(2), keyEntry('location'), keyEntry('location-eng')),
      box(
        'ilst',
        concat(u32(8 + 8 + 8 + ISO6709.length), u32(1), dataBox(1, bytes(ISO6709))),
        concat(u32(8 + 8 + 8 + ISO6709.length), u32(2), dataBox(1, bytes(ISO6709))),
      ),
    );
    const text = await contents(await stripVideoLocation(file(ftyp, mdat, moov(meta))));
    expect(text).not.toContain(ISO6709);
    expect(text).toContain('redacted-eng');
  });

  it('handles an ISO full-box meta (version/flags before the children)', async () => {
    const output = await stripVideoLocation(file(ftyp, moov(quickTimeMeta({ fullBox: true })), mdat));
    const text = await contents(output);
    expect(text).not.toContain(ISO6709);
    expect(text).toContain('com.apple.quicktime.redacted.ISO6709');
  });

  it('finds moov at the start or the end of the file', async () => {
    for (const input of [
      file(ftyp, moov(udtaWithXyz(), quickTimeMeta()), mdat),
      file(ftyp, mdat, moov(udtaWithXyz(), quickTimeMeta())),
    ]) {
      const output = await stripVideoLocation(input);
      const text = await contents(output);
      expect(output.size).toBe(input.size);
      expect(text).not.toContain(ISO6709);
      expect(text).toContain('frame-data-that-must-not-change');
    }
  });

  it('keeps the media data byte-for-byte', async () => {
    const input = file(ftyp, mdat, moov(udtaWithXyz()));
    const output = await stripVideoLocation(input);
    const before = new Uint8Array(await input.arrayBuffer());
    const after = new Uint8Array(await output.arrayBuffer());
    const moovStart = ftyp.length + mdat.length;
    expect(after.subarray(0, moovStart)).toEqual(before.subarray(0, moovStart));
  });

  it('walks past 64-bit largesize boxes, and reads a largesize moov', async () => {
    const bigMdat = largeBox('mdat', bytes('frame-data-that-must-not-change'));
    for (const input of [
      file(ftyp, bigMdat, moov(udtaWithXyz())),
      file(ftyp, bigMdat, largeBox('moov', mvhd, udtaWithXyz(), quickTimeMeta())),
    ]) {
      const output = await stripVideoLocation(input);
      const text = await contents(output);
      expect(output.size).toBe(input.size);
      expect(text).not.toContain('©xyz');
      expect(text).not.toContain(ISO6709);
    }
  });

  it('handles a final mdat whose size is 0 ("to end of file")', async () => {
    const openMdat = concat(u32(0), bytes('mdat'), bytes('rest-of-file'));
    const output = await stripVideoLocation(file(ftyp, moov(udtaWithXyz()), openMdat));
    expect(await contents(output)).not.toContain('©xyz');
  });

  it('returns the original file when there is no location', async () => {
    const input = file(ftyp, moov(box('udta', box('©mak', bytes('Apple')))), mdat);
    expect(await stripVideoLocation(input)).toBe(input);
  });

  it('returns the original file when the input is truncated', async () => {
    const whole = concat(ftyp, mdat, moov(udtaWithXyz(), quickTimeMeta()));
    for (const cut of [whole.length - 10, ftyp.length + mdat.length + 20, ftyp.length + 3]) {
      const input = new File([whole.slice(0, cut) as BlobPart], 'clip.mov', { type: 'video/quicktime' });
      expect(await stripVideoLocation(input)).toBe(input);
    }
  });

  it('returns the original file when a box inside moov is malformed', async () => {
    const badChild = concat(u32(9999), bytes('udta'), bytes('short'));
    const input = file(ftyp, box('moov', mvhd, badChild), mdat);
    expect(await stripVideoLocation(input)).toBe(input);
  });

  it('returns the original for non-ISO containers and garbage', async () => {
    const webm = new File([new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 1, 2, 3])], 'a.webm', { type: 'video/webm' });
    expect(await stripVideoLocation(webm)).toBe(webm);
    const junk = new File([bytes('not a video at all, just text') as BlobPart], 'b.mov', { type: 'video/quicktime' });
    expect(await stripVideoLocation(junk)).toBe(junk);
  });

  it('works from the file extension when the type is missing', async () => {
    const input = new File([concat(ftyp, moov(udtaWithXyz()), mdat) as BlobPart], 'IMG_2.MOV', { type: '' });
    expect(await contents(await stripVideoLocation(input))).not.toContain('©xyz');
  });
});

describe('patchMoov', () => {
  it('counts what it neutralised and changes nothing else', () => {
    const buf = moov(udtaWithXyz(), quickTimeMeta());
    const copy = buf.slice();
    // ©xyz, 2 location keys, 2 blanked values
    expect(patchMoov(buf)).toBe(5);
    expect(buf.length).toBe(copy.length);
    let changed = 0;
    for (let i = 0; i < buf.length; i++) if (buf[i] !== copy[i]) changed++;
    // ©xyz box (type + payload) + "location"→"redacted" ×2 + ISO6709 value + float value
    expect(changed).toBeLessThanOrEqual(4 + 4 + ISO6709.length + 16 + ISO6709.length + 4);
  });

  it('also clears 3GPP loci boxes and track-level user data', () => {
    const buf = box('moov', mvhd, box('trak', box('udta', box('loci', bytes('home')))));
    expect(patchMoov(buf)).toBe(1);
    expect(String.fromCharCode(...buf)).not.toContain('loci');
    expect(String.fromCharCode(...buf)).not.toContain('home');
  });

  it('throws on something that is not a moov box', () => {
    expect(() => patchMoov(box('free', bytes('x')))).toThrow();
  });
});
