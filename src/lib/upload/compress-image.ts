/**
 * Compress an image file on the client side.
 * Resizes to maxDim and converts to JPEG at given quality.
 * HEIC files from iOS are handled natively by Safari's canvas API.
 */
export function compressImage(
  file: File,
  maxDim = 2000,
  quality = 0.8
): Promise<File> {
  return new Promise((resolve) => {
    // Skip compression if already small
    if (file.size <= 500 * 1024) {
      resolve(file);
      return;
    }

    const img = new window.Image();
    img.onload = () => {
      let { width, height } = img;

      // Scale down if exceeds max dimension
      if (width > maxDim || height > maxDim) {
        const scale = maxDim / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          URL.revokeObjectURL(img.src);
          if (blob && blob.size < file.size) {
            resolve(
              new File([blob], file.name.replace(/\.\w+$/, '.jpg'), {
                type: 'image/jpeg',
              })
            );
          } else {
            resolve(file);
          }
        },
        'image/jpeg',
        quality
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(img.src);
      resolve(file);
    };

    img.src = URL.createObjectURL(file);
  });
}
