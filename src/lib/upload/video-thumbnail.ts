export interface VideoPreview {
  /** A JPEG of a frame near the start, or null if none could be drawn. */
  thumbnail: Blob | null;
  /** Length in seconds, or null if the browser couldn't read it. */
  duration: number | null;
}

/**
 * Read a video's length and a preview frame on the client. Seeks to 1
 * second (or the midpoint of a shorter clip) and captures that frame.
 *
 * Never rejects and never hangs: iOS Safari sometimes never delivers frame
 * data for a detached <video>, so after `timeoutMs` it resolves with
 * whatever it has (often just the duration).
 */
export function generateVideoThumbnail(file: Blob, maxWidth = 320, timeoutMs = 10_000): Promise<VideoPreview> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    // 'auto', not 'metadata': WebKit draws a black frame after seeking a
    // metadata-only video. The source is a local blob, so nothing is fetched.
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;

    const url = URL.createObjectURL(file);
    let duration: number | null = null;
    let seeking = false;
    let settled = false;

    const finish = (thumbnail: Blob | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(nudge);
      video.onloadedmetadata = null;
      video.onloadeddata = null;
      video.onseeked = null;
      video.onerror = null;
      // Release the decoder before revoking the URL it reads from.
      video.pause();
      video.removeAttribute('src');
      video.load();
      URL.revokeObjectURL(url);
      resolve({ thumbnail, duration });
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    // iOS may hold off loading a detached video until playback is asked for;
    // a muted inline play/pause gets the first frames decoded.
    const nudge = setTimeout(() => {
      if (!seeking) video.play().then(() => video.pause(), () => {});
    }, 2500);

    const draw = () => {
      if (settled || !video.videoWidth || !video.videoHeight) return;
      try {
        const canvas = document.createElement('canvas');
        canvas.width = Math.min(video.videoWidth, maxWidth);
        canvas.height = Math.round(canvas.width * (video.videoHeight / video.videoWidth));
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          finish(null);
          return;
        }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(
          (blob) => {
            canvas.width = 0;
            canvas.height = 0;
            finish(blob);
          },
          'image/jpeg',
          0.7,
        );
      } catch {
        finish(null);
      }
    };

    // Seek once frame data is there: 1 second in, or the middle of a shorter clip.
    const seek = () => {
      if (seeking || settled) return;
      seeking = true;
      try {
        video.currentTime = duration ? Math.min(1, duration / 2) : 0.1;
      } catch {
        finish(null);
      }
    };

    video.onloadedmetadata = () => {
      duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : null;
      if (video.readyState >= 2) seek();
    };
    video.onloadeddata = seek;
    video.onseeked = draw;
    video.onerror = () => finish(null);

    video.src = url;
    video.load();
  });
}
