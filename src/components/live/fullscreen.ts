/**
 * Fullscreen for the live stage. Desktop browsers and iPad take the standard
 * (or webkit-prefixed) Fullscreen API on the stage, which keeps our overlays.
 * iPhone Safari has no element fullscreen at all; there the only route is the
 * <video> element's native player via webkitEnterFullscreen.
 */

type FullscreenDoc = {
  fullscreenEnabled?: boolean;
  webkitFullscreenEnabled?: boolean;
  fullscreenElement?: Element | null;
  webkitFullscreenElement?: Element | null;
  exitFullscreen?: () => Promise<void>;
  webkitExitFullscreen?: () => void;
};

type FullscreenEl = { requestFullscreen?: () => Promise<void>; webkitRequestFullscreen?: () => void };

type NativeVideo = { webkitEnterFullscreen?: () => void };

export type FullscreenStrategy = 'element' | 'webkit-element' | 'video' | null;

export function fullscreenStrategy(
  doc: FullscreenDoc,
  stage: FullscreenEl | null,
  video: NativeVideo | null,
): FullscreenStrategy {
  if (stage && doc.fullscreenEnabled && typeof stage.requestFullscreen === 'function') return 'element';
  if (stage && doc.webkitFullscreenEnabled && typeof stage.webkitRequestFullscreen === 'function') return 'webkit-element';
  if (video && typeof video.webkitEnterFullscreen === 'function') return 'video';
  return null;
}

export function isStageFullscreen(doc: FullscreenDoc, stage: Element | null): boolean {
  if (!stage) return false;
  return (doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null) === stage;
}

/** Enter fullscreen, or leave it when the stage already is. Never throws. */
export async function toggleStageFullscreen(stage: HTMLElement | null, video: HTMLVideoElement | null) {
  const doc = document as unknown as FullscreenDoc;
  try {
    if (isStageFullscreen(doc, stage)) {
      if (doc.exitFullscreen) await doc.exitFullscreen();
      else doc.webkitExitFullscreen?.();
      return;
    }
    const el = stage as unknown as FullscreenEl;
    switch (fullscreenStrategy(doc, el, video as unknown as NativeVideo)) {
      case 'element':
        await el.requestFullscreen!();
        return;
      case 'webkit-element':
        el.webkitRequestFullscreen!();
        return;
      case 'video': {
        const v = video!;
        // iOS pauses the stream when its native player closes; resume it so
        // the viewer doesn't come back to a frozen frame.
        v.addEventListener('webkitendfullscreen', () => { v.play().catch(() => {}); }, { once: true });
        (v as unknown as Required<NativeVideo>).webkitEnterFullscreen();
        return;
      }
    }
  } catch {
    // Refused (e.g. no user gesture, or metadata not loaded yet): stay inline.
  }
}
