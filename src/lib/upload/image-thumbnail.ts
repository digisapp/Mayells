/**
 * A small JPEG preview of a photo, for the upload page's tiles.
 *
 * Tiles used to show the full-size original: a 12MP iPhone photo decodes to
 * ~48MB, and a couple of dozen of them is enough for iOS to kill and reload
 * the tab. A 240px thumbnail decodes to a few hundred KB.
 *
 * Never rejects: resolves null if the browser can't decode the image or
 * takes too long, and the tile falls back to a plain placeholder.
 */
export function generateImageThumbnail(file: Blob, shortSide = 240, timeoutMs = 10_000): Promise<Blob | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new window.Image();
    let settled = false;

    const finish = (blob: Blob | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      img.onload = null;
      img.onerror = null;
      URL.revokeObjectURL(url);
      resolve(blob);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);

    img.onload = () => {
      try {
        const scale = Math.min(1, shortSide / Math.max(1, Math.min(img.naturalWidth, img.naturalHeight)));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          finish(null);
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(
          (blob) => {
            // Free the canvas's backing store now; iOS caps total canvas memory.
            canvas.width = 0;
            canvas.height = 0;
            finish(blob);
          },
          'image/jpeg',
          0.75,
        );
      } catch {
        finish(null);
      }
    };
    img.onerror = () => finish(null);
    img.src = url;
  });
}
