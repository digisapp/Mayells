'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/** Below this the detail pages stack into one column and the bar takes over. */
export const BELOW_DESKTOP_QUERY = '(max-width: 1023.98px)';
// Everything above the fold's bottom that the sticky site nav covers.
const NAV_ALLOWANCE_PX = 72;
// The keyboard takes at least ~200px; toolbar collapse changes far less.
const KEYBOARD_MIN_PX = 150;

const noopSubscribe = () => () => {};

export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mq = window.matchMedia(query);
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    },
    [query],
  );
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => false);
}

function subscribeViewport(onChange: () => void) {
  const vv = window.visualViewport;
  vv?.addEventListener('resize', onChange);
  window.addEventListener('resize', onChange);
  return () => {
    vv?.removeEventListener('resize', onChange);
    window.removeEventListener('resize', onChange);
  };
}

/**
 * iOS keeps the layout viewport when the keyboard opens and shrinks only the
 * visual viewport, so the gap between the two is the keyboard (or a pinch
 * zoom — hiding a fixed bar then is right too).
 */
function useKeyboardOpen(): boolean {
  return useSyncExternalStore(
    subscribeViewport,
    () => {
      const vv = window.visualViewport;
      return !!vv && window.innerHeight - vv.height > KEYBOARD_MIN_PX;
    },
    () => false,
  );
}

/**
 * Scroll `el` just below the sticky nav, honouring reduced motion. `margin`
 * leaves extra room above it (e.g. the padding of the card it sits in).
 */
export function scrollIntoViewBelowNav(el: HTMLElement, margin = 8) {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const top = el.getBoundingClientRect().top + window.scrollY - NAV_ALLOWANCE_PX - margin;
  window.scrollTo({ top: Math.max(0, top), behavior: reduce ? 'auto' : 'smooth' });
}

interface MobileActionBarProps {
  /** The in-page primary action this bar stands in for; the bar hides while it is on screen. */
  target: HTMLElement | null;
  /** False when there is nothing to act on — the bar is not rendered at all. */
  enabled: boolean;
  /** Accessible name of the bar region, e.g. "Bid on this lot". */
  label: string;
  children: ReactNode;
}

/**
 * Sticky bottom action bar for phones and tablets (<1024px). It appears only
 * while the page's own call to action is scrolled out of view, steps aside
 * while the on-screen keyboard is up, publishes its height as
 * `--mobile-cta-bar` on <html> so floating UI (chat launcher, toasts) sits
 * above it and the footer pads itself clear of it at the end of the page.
 */
export function MobileActionBar({ target, enabled, label, children }: MobileActionBarProps) {
  const belowDesktop = useMediaQuery(BELOW_DESKTOP_QUERY);
  const keyboardOpen = useKeyboardOpen();
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const [targetInView, setTargetInView] = useState(true);
  const [barHeight, setBarHeight] = useState(0);
  const barRef = useRef<HTMLDivElement>(null);

  const active = enabled && belowDesktop;
  // Until the target exists (e.g. the bid form is still resolving auth) the
  // page CTA can't be on screen, so the bar may show.
  const shown = active && !keyboardOpen && !(target && targetInView);

  useEffect(() => {
    if (!active || !target) return;
    const io = new IntersectionObserver(
      ([entry]) => setTargetInView(entry.isIntersecting && entry.intersectionRatio >= 0.6),
      // The sticky nav hides the top of the viewport.
      { rootMargin: `-${NAV_ALLOWANCE_PX}px 0px 0px 0px`, threshold: [0, 0.6, 1] },
    );
    io.observe(target);
    return () => io.disconnect();
  }, [active, target]);

  useEffect(() => {
    const el = barRef.current;
    if (!active || !el) return;
    const measure = () => setBarHeight(el.offsetHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [active, mounted]);

  // Shared contract: floating UI offsets itself by this while the bar shows.
  useEffect(() => {
    if (!shown || !barHeight) return;
    const root = document.documentElement;
    root.style.setProperty('--mobile-cta-bar', `${barHeight}px`);
    return () => {
      root.style.removeProperty('--mobile-cta-bar');
    };
  }, [shown, barHeight]);

  if (!active || !mounted) return null;

  // Portalled to <body> so no transformed ancestor can re-anchor `fixed`.
  return createPortal(
    <div
      ref={barRef}
      role="region"
      aria-label={label}
      aria-hidden={!shown}
      inert={!shown}
      data-mobile-cta-bar=""
      className={`fixed inset-x-0 bottom-0 z-40 border-t border-border/80 bg-card/97 pb-[env(safe-area-inset-bottom)] shadow-[0_-10px_30px_-18px_rgba(0,0,0,0.25)] backdrop-blur-xl backdrop-saturate-150 transition-[transform,opacity] duration-300 ease-out motion-reduce:transition-none lg:hidden ${
        shown ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-full opacity-0'
      }`}
    >
      <div className="mx-auto flex max-w-3xl items-center gap-3 py-2.5 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))]">
        {children}
      </div>
    </div>,
    document.body,
  );
}
