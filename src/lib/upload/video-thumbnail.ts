/**
 * Generate a JPEG thumbnail from a video file on the client.
 * Seeks to 1 second (or midpoint for short videos) and captures a frame.
 */
export function generateVideoThumbnail(file: File, maxWidth = 400): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;

    const url = URL.createObjectURL(file);
    video.src = url;

    video.onloadeddata = () => {
      video.currentTime = Math.min(1, video.duration / 2);
    };

    video.onseeked = () => {
      const canvas = document.createElement('canvas');
      const aspect = video.videoHeight / video.videoWidth;
      canvas.width = Math.min(video.videoWidth, maxWidth);
      canvas.height = Math.round(canvas.width * aspect);
      canvas.getContext('2d')!.drawImage(video, 0, 0, canvas.width, canvas.height);

      canvas.toBlob(
        (blob) => {
          URL.revokeObjectURL(url);
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Failed to generate video thumbnail'));
          }
        },
        'image/jpeg',
        0.7
      );
    };

    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load video for thumbnail'));
    };
  });
}
