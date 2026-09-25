import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { compressImage, prepareImage } from '../compress-image';
import { bytes, heif, iphoneLike, text } from './heif-fixtures';

// Node has no image decoder, so these stand in for a browser that can't
// decode the photo (desktop Chrome and Firefox with a HEIC) or never finishes.
class UndecodableImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  set src(_url: string) {
    setTimeout(() => this.onerror?.(), 0);
  }
  removeAttribute() {}
}

class StuckImage extends UndecodableImage {
  set src(_url: string) {}
}

function heicPhoto(name = 'IMG_0001.HEIC', type = 'image/heic'): File {
  return new File([heif(iphoneLike()).file as BlobPart], name, { type });
}

async function contents(file: Blob): Promise<string> {
  return text(new Uint8Array(await file.arrayBuffer()));
}

describe('prepareImage fallback', () => {
  beforeEach(() => {
    vi.stubGlobal('window', { Image: UndecodableImage });
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:photo');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('uploads a HEIC the browser could not convert without its location', async () => {
    const input = heicPhoto();
    expect(await contents(input)).toContain('GPSLatitude');

    const output = await compressImage(input);

    expect(output).not.toBe(input);
    expect(output.name).toBe('IMG_0001.HEIC');
    expect(output.type).toBe('image/heic');
    expect(output.size).toBe(input.size);
    expect(await contents(output)).not.toContain('GPSLatitude');
  });

  it('does the same for a HEIC handed over with no type', async () => {
    const output = await compressImage(heicPhoto('IMG_0002.heic', ''));
    expect(await contents(output)).not.toContain('GPSLatitude');
  });

  it('strips a HEIC whose decode timed out', async () => {
    vi.stubGlobal('window', { Image: StuckImage });
    const input = heicPhoto();
    const { file, thumbnail } = await prepareImage(input, { timeoutMs: 5, thumbnailDim: 200 });
    expect(file).not.toBe(input);
    expect(await contents(file)).not.toContain('GPSLatitude');
    expect(thumbnail).toBeNull();
  });

  it('keeps any other undecodable file exactly as it was', async () => {
    const gif = new File([bytes('GIF89a-not-really') as BlobPart], 'a.gif', { type: 'image/gif' });
    expect(await compressImage(gif)).toBe(gif);
    const bigJpeg = new File([new Uint8Array(600 * 1024) as BlobPart], 'a.jpg', { type: 'image/jpeg' });
    expect(await compressImage(bigJpeg)).toBe(bigJpeg);
  });
});
