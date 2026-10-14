import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NoStillImagesError, isVideoUrl, visionImageParts, visionImageUrls } from '../vision-images';

const BASE = 'https://abc.supabase.co/storage/v1/object/public/lot-images/uploads/p1';

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://abc.supabase.co');
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('isVideoUrl', () => {
  it('reads the extension from the path, not the query', () => {
    expect(isVideoUrl(`${BASE}/clip.MOV`)).toBe(true);
    expect(isVideoUrl(`${BASE}/clip.mp4?t=1`)).toBe(true);
    expect(isVideoUrl(`${BASE}/photo.jpg?name=clip.mp4`)).toBe(false);
    expect(isVideoUrl('not a url.webm')).toBe(true);
  });
});

describe('visionImageUrls', () => {
  it('drops videos and keeps photos in order', () => {
    expect(visionImageUrls([`${BASE}/a.jpg`, `${BASE}/clip.mov`, `${BASE}/b.png`])).toEqual([
      `${BASE}/a.jpg`,
      `${BASE}/b.png`,
    ]);
  });

  it('swaps our HEIC photos for a rendition the model can read', () => {
    expect(visionImageUrls([`${BASE}/a.HEIC`])).toEqual([
      'https://abc.supabase.co/storage/v1/render/image/public/lot-images/uploads/p1/a.HEIC?width=1600&quality=80',
    ]);
  });

  it('leaves a HEIC from elsewhere as it is', () => {
    expect(visionImageUrls(['https://example.com/a.heic'])).toEqual(['https://example.com/a.heic']);
  });
});

describe('visionImageParts', () => {
  it('builds image parts from the stills', () => {
    expect(visionImageParts([`${BASE}/a.jpg`, `${BASE}/clip.mp4`])).toEqual([
      { type: 'image', image: new URL(`${BASE}/a.jpg`) },
    ]);
  });

  it('refuses a set with no stills', () => {
    expect(() => visionImageParts([`${BASE}/clip.mp4`])).toThrow(NoStillImagesError);
    expect(() => visionImageParts([])).toThrow(NoStillImagesError);
  });
});
