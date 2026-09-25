'use client';

import { useSyncExternalStore } from 'react';

/**
 * Phones, portrait (below Tailwind's `sm`) or landscape (under 500px tall):
 * the chat opens as a full-screen sheet there rather than a floating card,
 * which could not fit beside the keyboard.
 */
const PHONE_QUERY = '(max-width: 639.98px), (max-height: 499.98px)';

function subscribePhone(onChange: () => void) {
  const mq = window.matchMedia(PHONE_QUERY);
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}

export function useIsPhone(): boolean {
  return useSyncExternalStore(
    subscribePhone,
    () => window.matchMedia(PHONE_QUERY).matches,
    () => false,
  );
}

export interface VisualViewportBox {
  /** Visual viewport's offset from the top of the layout viewport (iOS pans it when the keyboard opens). */
  top: number;
  height: number;
  /** How much of the layout viewport the on-screen keyboard covers; 0 when closed. */
  keyboardInset: number;
  /** Pinch-zoomed: tracking the visual viewport would undo the zoom, so callers stop. */
  zoomed: boolean;
}

const SERVER_BOX: VisualViewportBox = { top: 0, height: 0, keyboardInset: 0, zoomed: false };
let cachedBox = SERVER_BOX;

function readBox(): VisualViewportBox {
  const vv = window.visualViewport;
  const innerHeight = window.innerHeight;
  const top = Math.round(vv?.offsetTop ?? 0);
  const height = Math.round(vv?.height ?? innerHeight);
  const zoomed = (vv?.scale ?? 1) > 1.05;
  const inset = zoomed ? 0 : innerHeight - height - top;
  // Only a large shrink is the keyboard; browser chrome changes are smaller.
  const keyboardInset = inset > 100 ? inset : 0;
  const c = cachedBox;
  if (c.top === top && c.height === height && c.keyboardInset === keyboardInset && c.zoomed === zoomed) return c;
  cachedBox = { top, height, keyboardInset, zoomed };
  return cachedBox;
}

function subscribeViewport(onChange: () => void) {
  const vv = window.visualViewport;
  // iOS both resizes AND scrolls (pans) the visual viewport when the keyboard
  // opens, so listening to resize alone leaves the composer under the keyboard.
  vv?.addEventListener('resize', onChange);
  vv?.addEventListener('scroll', onChange);
  window.addEventListener('resize', onChange);
  return () => {
    vv?.removeEventListener('resize', onChange);
    vv?.removeEventListener('scroll', onChange);
    window.removeEventListener('resize', onChange);
  };
}

/** The part of the page actually visible to the user, updated as the keyboard opens, closes or pans. */
export function useVisualViewport(): VisualViewportBox {
  return useSyncExternalStore(subscribeViewport, readBox, () => SERVER_BOX);
}
