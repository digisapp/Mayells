import { describe, it, expect } from 'vitest';
import { reencodePolicy, SMALL_PHOTO_BYTES } from '../reencode-policy';

const KB = 1024;
const file = (name: string, type: string, size: number) => ({ name, type, size });

describe('reencodePolicy', () => {
  it('keeps small JPEG, PNG and WebP (the server scrubs their metadata)', () => {
    expect(reencodePolicy(file('a.jpg', 'image/jpeg', 200 * KB))).toBe('keep');
    expect(reencodePolicy(file('a.JPEG', 'image/jpeg', SMALL_PHOTO_BYTES))).toBe('keep');
    expect(reencodePolicy(file('a.png', 'image/png', 10 * KB))).toBe('keep');
    expect(reencodePolicy(file('a.webp', 'image/webp', 10 * KB))).toBe('keep');
    expect(reencodePolicy(file('blob', 'image/jpeg', 10 * KB))).toBe('keep');
  });

  it('shrinks large JPEG, PNG and WebP', () => {
    expect(reencodePolicy(file('a.jpg', 'image/jpeg', SMALL_PHOTO_BYTES + 1))).toBe('shrink');
    expect(reencodePolicy(file('a.png', 'image/png', 4000 * KB))).toBe('shrink');
    expect(reencodePolicy(file('a.webp', 'image/webp', 900 * KB))).toBe('shrink');
  });

  it('always converts HEIC/HEIF, however small — the server can’t scrub their GPS', () => {
    expect(reencodePolicy(file('IMG_0001.HEIC', 'image/heic', 90 * KB))).toBe('convert');
    expect(reencodePolicy(file('IMG_0001.heif', 'image/heif', 90 * KB))).toBe('convert');
    expect(reencodePolicy(file('IMG_0001.heic', 'image/heic', 3000 * KB))).toBe('convert');
    // iOS and some pickers hand HEIC over with an empty or generic type
    expect(reencodePolicy(file('IMG_0001.heic', '', 90 * KB))).toBe('convert');
    expect(reencodePolicy(file('IMG_0001.heic', 'application/octet-stream', 90 * KB))).toBe('convert');
  });

  it('converts a type the name contradicts', () => {
    expect(reencodePolicy(file('IMG_0001.heic', 'image/jpeg', 90 * KB))).toBe('convert');
  });

  it('converts every other image format', () => {
    expect(reencodePolicy(file('a.avif', 'image/avif', 50 * KB))).toBe('convert');
    expect(reencodePolicy(file('a.tiff', 'image/tiff', 50 * KB))).toBe('convert');
    expect(reencodePolicy(file('a.gif', 'image/gif', 50 * KB))).toBe('convert');
    expect(reencodePolicy(file('scan', '', 50 * KB))).toBe('convert');
  });

  it('leaves non-images alone', () => {
    expect(reencodePolicy(file('clip.mov', 'video/quicktime', 9000 * KB))).toBe('keep');
  });

  it('honours a custom size threshold', () => {
    expect(reencodePolicy(file('a.jpg', 'image/jpeg', 200 * KB), 100 * KB)).toBe('shrink');
  });
});
