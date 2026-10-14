import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renditionUrl, storagePathFromPublicUrl } from '../storage-url';

const BASE = 'https://abc.supabase.co/storage/v1/object/public/lot-images';

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://abc.supabase.co');
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('storagePathFromPublicUrl', () => {
  it('extracts the path from a lot-images public URL', () => {
    expect(storagePathFromPublicUrl(`${BASE}/uploads/p1/123-x.jpg`)).toBe('uploads/p1/123-x.jpg');
  });

  it('returns null for URLs outside the bucket', () => {
    expect(storagePathFromPublicUrl('https://example.com/photo.jpg')).toBeNull();
    expect(storagePathFromPublicUrl('https://abc.supabase.co/storage/v1/object/public/other/x.jpg')).toBeNull();
  });

  it('drops query strings and decodes the path', () => {
    expect(storagePathFromPublicUrl(`${BASE}/a%20b.jpg?width=100`)).toBe('a b.jpg');
  });

  it('rejects the bucket path on another host', () => {
    expect(
      storagePathFromPublicUrl('https://attacker.supabase.co/storage/v1/object/public/lot-images/uploads/p1/x.jpg'),
    ).toBeNull();
    expect(
      storagePathFromPublicUrl('https://abc.supabase.co.evil.example/storage/v1/object/public/lot-images/uploads/p1/x.jpg'),
    ).toBeNull();
    expect(storagePathFromPublicUrl('http://abc.supabase.co/storage/v1/object/public/lot-images/uploads/p1/x.jpg')).toBeNull();
  });

  it('requires the bucket prefix at the start of the path', () => {
    expect(
      storagePathFromPublicUrl('https://abc.supabase.co/x/storage/v1/object/public/lot-images/uploads/p1/x.jpg'),
    ).toBeNull();
    // The marker hidden in the query string of an unrelated URL.
    expect(
      storagePathFromPublicUrl('https://evil.example/?u=/storage/v1/object/public/lot-images/uploads/p1/x.jpg'),
    ).toBeNull();
  });

  it('rejects the bare bucket, malformed URLs and bad escapes', () => {
    expect(storagePathFromPublicUrl(`${BASE}/`)).toBeNull();
    expect(storagePathFromPublicUrl('/storage/v1/object/public/lot-images/uploads/p1/x.jpg')).toBeNull();
    expect(storagePathFromPublicUrl(`${BASE}/uploads/%E0%A4%A.jpg`)).toBeNull();
  });

  it('keeps encoded traversal visible to callers', () => {
    // The URL parser folds literal "..", but an escaped slash survives
    // decoding, so callers must still refuse paths containing "..".
    expect(storagePathFromPublicUrl(`${BASE}/uploads/p1/..%2F..%2Fother.jpg`)).toBe('uploads/p1/../../other.jpg');
  });

  it('accepts nothing when the project URL is not configured', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    expect(storagePathFromPublicUrl(`${BASE}/uploads/p1/x.jpg`)).toBeNull();
  });

  it('tolerates a trailing slash or newline on the configured URL', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://abc.supabase.co/\n');
    expect(storagePathFromPublicUrl(`${BASE}/uploads/p1/x.jpg`)).toBe('uploads/p1/x.jpg');
  });
});

describe('renditionUrl', () => {
  it('points our objects at the image transform endpoint', () => {
    expect(renditionUrl(`${BASE}/uploads/p1/x.heic`)).toBe(
      'https://abc.supabase.co/storage/v1/render/image/public/lot-images/uploads/p1/x.heic?width=1600&quality=80',
    );
  });

  it('replaces any query string', () => {
    expect(renditionUrl(`${BASE}/uploads/p1/x.heic?t=1`, 1024)).toBe(
      'https://abc.supabase.co/storage/v1/render/image/public/lot-images/uploads/p1/x.heic?width=1024&quality=80',
    );
  });

  it('leaves other URLs alone', () => {
    expect(renditionUrl('https://example.com/x.heic')).toBeNull();
  });
});
