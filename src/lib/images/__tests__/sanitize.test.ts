import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { stripImageMetadata, sanitizeImageForStorage } from '../sanitize';

async function jpegWithExif(): Promise<Buffer> {
  return sharp({
    create: { width: 8, height: 8, channels: 3, background: { r: 200, g: 100, b: 50 } },
  })
    .jpeg()
    .withExif({
      IFD0: { ImageDescription: 'shot at home', Software: 'test' },
      IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '40/1 44/1 3012/100' },
    })
    .toBuffer();
}

describe('stripImageMetadata', () => {
  it('removes EXIF (including GPS) from a JPEG', async () => {
    const input = await jpegWithExif();
    expect((await sharp(input).metadata()).exif).toBeDefined();

    const result = await stripImageMetadata(input);
    expect(result).not.toBeNull();
    expect(result!.contentType).toBe('image/jpeg');

    const outMeta = await sharp(result!.buffer).metadata();
    expect(outMeta.exif).toBeUndefined();
    expect(outMeta.format).toBe('jpeg');
  });

  it('returns null when there is no metadata to strip', async () => {
    const clean = await sharp({
      create: { width: 8, height: 8, channels: 3, background: { r: 0, g: 0, b: 0 } },
    })
      .png()
      .toBuffer();
    expect(await stripImageMetadata(clean)).toBeNull();
  });

  it('returns null for non-image bytes', async () => {
    expect(await stripImageMetadata(Buffer.from('not an image'))).toBeNull();
  });

  it('preserves orientation by baking it into pixels', async () => {
    // 2x1 landscape tagged orientation 6 (rotate 90 CW) should come out 1x2
    const oriented = await sharp({
      create: { width: 2, height: 1, channels: 3, background: { r: 255, g: 0, b: 0 } },
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();

    const result = await stripImageMetadata(oriented);
    expect(result).not.toBeNull();
    const outMeta = await sharp(result!.buffer).metadata();
    expect(outMeta.width).toBe(1);
    expect(outMeta.height).toBe(2);
    expect(outMeta.orientation).toBeUndefined();
  });
});

describe('sanitizeImageForStorage', () => {
  it('strips metadata when present', async () => {
    const result = await sanitizeImageForStorage(await jpegWithExif());
    expect(result).not.toBeNull();
    expect((await sharp(result!.buffer).metadata()).exif).toBeUndefined();
  });

  it('keeps a clean image as-is instead of dropping it', async () => {
    // What a canvas-compressed phone photo looks like: a JPEG with no metadata.
    const clean = await sharp({
      create: { width: 8, height: 8, channels: 3, background: { r: 10, g: 20, b: 30 } },
    })
      .jpeg()
      .toBuffer();
    const result = await sanitizeImageForStorage(clean);
    expect(result).toEqual({ buffer: clean, contentType: 'image/jpeg' });
  });

  it('rejects bytes it cannot read', async () => {
    expect(await sanitizeImageForStorage(Buffer.from('not an image'))).toBeNull();
  });
});
