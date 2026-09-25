import { describe, it, expect, vi, beforeEach } from 'vitest';
import sharp from 'sharp';
import { PICTURE, allZero, heif, iphoneLike, text } from '@/lib/upload/__tests__/heif-fixtures';

// An in-memory stand-in for the lot-images bucket.
const bucket = vi.hoisted(() => ({
  objects: new Map<string, { bytes: Uint8Array; type: string }>(),
  downloads: [] as string[],
  uploads: [] as { path: string; body: Buffer; contentType?: string; upsert?: boolean }[],
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    storage: {
      from: () => ({
        download: async (path: string) => {
          bucket.downloads.push(path);
          const object = bucket.objects.get(path);
          if (!object) return { data: null, error: { message: 'Object not found' } };
          return { data: new Blob([object.bytes as BlobPart], { type: object.type }), error: null };
        },
        upload: async (path: string, body: Buffer, options: { contentType?: string; upsert?: boolean }) => {
          bucket.uploads.push({ path, body, ...options });
          return { data: { path }, error: null };
        },
      }),
    },
  }),
}));

import { sanitizeStoredImages } from '../sanitize';

function store(path: string, bytes: Uint8Array, type: string) {
  bucket.objects.set(path, { bytes, type });
}

describe('sanitizeStoredImages', () => {
  beforeEach(() => {
    bucket.objects.clear();
    bucket.downloads.length = 0;
    bucket.uploads.length = 0;
    vi.restoreAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('blanks a stored HEIC’s Exif and XMP and re-uploads it to the same path and type', async () => {
    const { file, where } = heif(iphoneLike());
    expect(text(file)).toContain('GPSLatitude');
    store('uploads/p1/1-a.heic', file, 'image/heic');

    await sanitizeStoredImages(['uploads/p1/1-a.heic']);

    expect(bucket.uploads).toHaveLength(1);
    const [upload] = bucket.uploads;
    expect(upload).toMatchObject({ path: 'uploads/p1/1-a.heic', contentType: 'image/heic', upsert: true });
    const out = new Uint8Array(upload.body);
    expect(out.length).toBe(file.length);
    expect(allZero(out, [...where.get(2)!, ...where.get(3)!])).toBe(true);
    const [picture] = where.get(1)!;
    expect(out.subarray(picture.start, picture.end)).toEqual(PICTURE);
    expect(text(out)).not.toContain('GPSLatitude');
  });

  it('knows a HEIC by its bytes, whatever its name or stored type', async () => {
    store('submissions/1-a.jpg', heif(iphoneLike()).file, 'image/jpeg');
    store('submissions/2-b.heif', heif(iphoneLike()).file, 'application/octet-stream');
    store('submissions/3-c', heif(iphoneLike()).file, '');

    await sanitizeStoredImages(['submissions/1-a.jpg', 'submissions/2-b.heif', 'submissions/3-c']);

    // The stored type is kept when it names an image, else taken from the name.
    expect(bucket.uploads.map(({ path, contentType }) => [path, contentType])).toEqual([
      ['submissions/1-a.jpg', 'image/jpeg'],
      ['submissions/2-b.heif', 'image/heif'],
      ['submissions/3-c', 'image/heic'],
    ]);
    for (const { body } of bucket.uploads) expect(text(new Uint8Array(body))).not.toContain('GPSLatitude');
  });

  it('leaves a HEIC without metadata as it is', async () => {
    store('uploads/p1/clean.heic', heif({ items: [{ id: 1, type: 'hvc1' }], mdat: [{ id: 1, data: PICTURE }] }).file, 'image/heic');
    await sanitizeStoredImages(['uploads/p1/clean.heic']);
    expect(bucket.uploads).toHaveLength(0);
  });

  it('leaves a HEIC it can’t patch safely, and says so', async () => {
    const whole = heif(iphoneLike()).file;
    store('uploads/p1/cut.heic', whole.slice(0, whole.length - 5), 'image/heic');

    await sanitizeStoredImages(['uploads/p1/cut.heic']);

    expect(bucket.uploads).toHaveLength(0);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('HEIF location could not be removed'));
  });

  it('still re-encodes JPEGs through sharp', async () => {
    const jpeg = await sharp({ create: { width: 8, height: 8, channels: 3, background: { r: 200, g: 100, b: 50 } } })
      .jpeg()
      .withExif({ IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '40/1 44/1 3012/100' } })
      .toBuffer();
    store('uploads/p1/2-b.jpg', jpeg, 'image/jpeg');

    await sanitizeStoredImages(['uploads/p1/2-b.jpg']);

    expect(bucket.uploads).toHaveLength(1);
    expect(bucket.uploads[0]).toMatchObject({ path: 'uploads/p1/2-b.jpg', contentType: 'image/jpeg', upsert: true });
    expect((await sharp(bucket.uploads[0].body).metadata()).exif).toBeUndefined();
  });

  it('skips videos without downloading them, and survives a missing object', async () => {
    await sanitizeStoredImages(['uploads/p1/clip.mov', 'uploads/p1/gone.heic']);
    expect(bucket.downloads).toEqual(['uploads/p1/gone.heic']);
    expect(bucket.uploads).toHaveLength(0);
  });
});
