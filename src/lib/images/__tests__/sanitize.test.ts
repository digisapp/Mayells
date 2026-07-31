import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { stripImageMetadata, storagePathFromPublicUrl } from '../sanitize';

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

describe('storagePathFromPublicUrl', () => {
  it('extracts the path from a lot-images public URL', () => {
    expect(
      storagePathFromPublicUrl(
        'https://abc.supabase.co/storage/v1/object/public/lot-images/uploads/p1/123-x.jpg',
      ),
    ).toBe('uploads/p1/123-x.jpg');
  });

  it('returns null for URLs outside the bucket', () => {
    expect(storagePathFromPublicUrl('https://example.com/photo.jpg')).toBeNull();
    expect(
      storagePathFromPublicUrl('https://abc.supabase.co/storage/v1/object/public/other/x.jpg'),
    ).toBeNull();
  });

  it('drops query strings and decodes the path', () => {
    expect(
      storagePathFromPublicUrl(
        'https://abc.supabase.co/storage/v1/object/public/lot-images/a%20b.jpg?width=100',
      ),
    ).toBe('a b.jpg');
  });
});
