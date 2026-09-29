'use client';

import { useEffect, type RefObject } from 'react';

// Elements on screen that the floating chat bubble would otherwise cover.
const covering = new Set<Element>();

function sync() {
  document.documentElement.toggleAttribute('data-chat-launcher-hidden', covering.size > 0);
}

/**
 * Hide the floating chat bubble while `ref`'s element is on screen, below the
 * lg breakpoint only (see globals.css). On a phone it sits on a lead form's
 * fields and submit button, and the forms offer their own "chat with a
 * specialist" link; on desktop there is room for both, so it stays. An open
 * chat keeps its bubble, which is its close button.
 */
export function useHideChatLauncher(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver((entries) => {
      // A fast scroll can deliver several entries at once; the last is current.
      const latest = entries[entries.length - 1];
      if (latest.isIntersecting) covering.add(el);
      else covering.delete(el);
      sync();
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
      covering.delete(el);
      sync();
    };
  }, [ref]);
}
