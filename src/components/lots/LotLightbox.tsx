'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  IDENTITY,
  clampTransform,
  containRect,
  doubleTapTransform,
  pinchTransform,
  settleTransform,
  toCss,
  type Point,
  type Size,
  type Transform,
} from './lightbox-math';

interface LightboxImage {
  url: string;
  alt: string;
}

interface LotLightboxProps {
  images: LightboxImage[];
  index: number;
  onIndexChange: (index: number) => void;
  /** Close request (✕, Escape, swipe down). The owner decides how (history.back()). */
  onRequestClose: () => void;
}

// Gesture tuning, in CSS px / ms.
const SLOP = 8; // movement before a touch counts as a drag rather than a tap
const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_SLOP = 30;
const SWIPE_COMMIT = 0.2; // share of the stage width that commits a page turn
const SWIPE_VELOCITY = 0.4;
const CLOSE_DISTANCE = 110;
const CLOSE_VELOCITY = 0.5;
const EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)';

type Gesture =
  | { kind: 'idle' }
  | { kind: 'pending'; start: Point; at: number }
  | { kind: 'swipe-x'; start: Point }
  | { kind: 'swipe-y'; start: Point }
  | { kind: 'pan'; start: Point; from: Transform }
  | { kind: 'pinch'; from: Transform; mid: Point; distance: number };

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const midpoint = (a: Point, b: Point) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/**
 * Full-screen image viewer with its own gestures. The stage is
 * `touch-action: none`, so the page itself can never pinch-zoom (which used
 * to strand the close button off-screen and leave the page zoomed after
 * closing). Instead: pinch about the fingers' midpoint, pan when zoomed,
 * double-tap to zoom toward the tapped point, swipe sideways between images
 * and swipe down to close.
 */
export function LotLightbox({ images, index, onIndexChange, onRequestClose }: LotLightboxProps) {
  const count = images.length;
  const [zoomed, setZoomed] = useState(false);

  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  // Gesture state lives in refs and is written straight to the DOM: a
  // re-render per pointer move would be wasted work at 120Hz.
  const pointers = useRef(new Map<number, Point>());
  const gesture = useRef<Gesture>({ kind: 'idle' });
  const transform = useRef<Transform>(IDENTITY);
  const naturalSizes = useRef(new Map<number, Size>());
  const lastTap = useRef<{ at: number; point: Point } | null>(null);
  const velocity = useRef({ x: 0, y: 0, point: { x: 0, y: 0 }, at: 0 });
  const indexRef = useRef(index);
  const reducedMotion = useRef(false);

  const stageSize = useCallback((): Size => {
    const el = stageRef.current;
    return { width: el?.clientWidth ?? 1, height: el?.clientHeight ?? 1 };
  }, []);
  const contentRect = useCallback(
    () => containRect(stageSize(), naturalSizes.current.get(indexRef.current) ?? null),
    [stageSize],
  );
  const currentSlide = useCallback(
    () => stageRef.current?.querySelectorAll<HTMLElement>('[data-zoom]')[indexRef.current] ?? null,
    [],
  );

  const setTransition = (el: HTMLElement | null, animate: boolean) => {
    if (el) el.style.transition = animate && !reducedMotion.current ? `transform 280ms ${EASE}, opacity 280ms ${EASE}` : 'none';
  };

  const applyZoom = useCallback(
    (t: Transform, animate: boolean) => {
      transform.current = t;
      const el = currentSlide();
      setTransition(el, animate);
      if (el) el.style.transform = toCss(t);
    },
    [currentSlide],
  );

  const applyTrack = useCallback(
    (dragX: number, animate: boolean) => {
      const el = trackRef.current;
      if (!el) return;
      setTransition(el, animate);
      el.style.transform = `translate3d(${-indexRef.current * stageSize().width + dragX}px, 0, 0)`;
    },
    [stageSize],
  );

  const applyDismiss = (dy: number, animate: boolean) => {
    const slide = currentSlide();
    setTransition(slide, animate);
    if (slide) slide.style.transform = dy ? `translate3d(0, ${dy}px, 0) scale(${1 - Math.min(Math.abs(dy) / 2000, 0.15)})` : toCss(IDENTITY);
    const backdrop = backdropRef.current;
    setTransition(backdrop, animate);
    if (backdrop) backdrop.style.opacity = String(1 - Math.min(Math.abs(dy) / 500, 0.6));
  };

  // Mount: reduced-motion preference, focus the close button, Escape/arrows,
  // body scroll lock, and Safari's non-standard pinch events.
  useEffect(() => {
    reducedMotion.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const root = rootRef.current;
    // iOS fires gesture* for pinches even under touch-action: none on some
    // versions; cancelling them keeps the page itself from zooming.
    const stopGesture = (e: Event) => e.preventDefault();
    root?.addEventListener('gesturestart', stopGesture);
    root?.addEventListener('gesturechange', stopGesture);
    return () => {
      document.body.style.overflow = prevOverflow;
      root?.removeEventListener('gesturestart', stopGesture);
      root?.removeEventListener('gesturechange', stopGesture);
      opener?.focus?.({ preventScroll: true });
    };
  }, []);

  const goTo = useCallback(
    (next: number, animate = true) => {
      const clamped = Math.max(0, Math.min(count - 1, next));
      if (clamped !== indexRef.current) {
        applyZoom(IDENTITY, false); // leave the old slide un-zoomed
        setZoomed(false);
        indexRef.current = clamped;
        onIndexChange(clamped);
      }
      applyTrack(0, animate);
    },
    [applyTrack, applyZoom, count, onIndexChange],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onRequestClose();
      else if (e.key === 'ArrowLeft' && transform.current.scale <= 1) goTo(indexRef.current - 1);
      else if (e.key === 'ArrowRight' && transform.current.scale <= 1) goTo(indexRef.current + 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goTo, onRequestClose]);

  // Position the track on the opening image, and keep it there on rotation.
  useLayoutEffect(() => {
    applyTrack(0, false);
    const onResize = () => {
      applyTrack(0, false);
      applyZoom(IDENTITY, false);
      setZoomed(false);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [applyTrack, applyZoom]);

  const toStage = (e: React.PointerEvent): Point => {
    const rect = stageRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const trackVelocity = (p: Point) => {
    const now = performance.now();
    const v = velocity.current;
    const dt = Math.max(now - v.at, 1);
    velocity.current = { x: (p.x - v.point.x) / dt, y: (p.y - v.point.y) / dt, point: p, at: now };
  };

  const startPinch = () => {
    const [a, b] = [...pointers.current.values()];
    gesture.current = { kind: 'pinch', from: transform.current, mid: midpoint(a, b), distance: distance(a, b) };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    try {
      // Keep receiving this finger's moves even if it leaves the stage.
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Pointer already gone (lifted between dispatch and handling).
    }
    const p = toStage(e);
    pointers.current.set(e.pointerId, p);
    if (pointers.current.size === 2) {
      // Abandon any one-finger drag in progress and pinch from where it is.
      applyTrack(0, true);
      startPinch();
    } else if (pointers.current.size === 1) {
      gesture.current = { kind: 'pending', start: p, at: performance.now() };
      velocity.current = { x: 0, y: 0, point: p, at: performance.now() };
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    const p = toStage(e);
    pointers.current.set(e.pointerId, p);
    trackVelocity(p);
    const g = gesture.current;

    if (g.kind === 'pinch' && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const next = pinchTransform(g.from, g, { mid: midpoint(a, b), distance: distance(a, b) });
      transform.current = next;
      const el = currentSlide();
      setTransition(el, false);
      if (el) el.style.transform = toCss(next);
      return;
    }

    if (g.kind === 'pending') {
      const dx = p.x - g.start.x;
      const dy = p.y - g.start.y;
      if (Math.hypot(dx, dy) < SLOP) return;
      if (transform.current.scale > 1.01) gesture.current = { kind: 'pan', start: g.start, from: transform.current };
      else if (Math.abs(dx) > Math.abs(dy)) gesture.current = count > 1 ? { kind: 'swipe-x', start: g.start } : { kind: 'swipe-y', start: g.start };
      else gesture.current = { kind: 'swipe-y', start: g.start };
    }

    const cur = gesture.current;
    if (cur.kind === 'pan') {
      const next = clampTransform(
        { scale: cur.from.scale, x: cur.from.x + p.x - cur.start.x, y: cur.from.y + p.y - cur.start.y },
        stageSize(),
        contentRect(),
      );
      applyZoom(next, false);
    } else if (cur.kind === 'swipe-x') {
      let dx = p.x - cur.start.x;
      const atEdge = (dx > 0 && indexRef.current === 0) || (dx < 0 && indexRef.current === count - 1);
      if (atEdge) dx *= 0.35; // rubber band past the first / last image
      applyTrack(dx, false);
    } else if (cur.kind === 'swipe-y') {
      const dy = p.y - cur.start.y;
      applyDismiss(dy > 0 ? dy : dy * 0.3, false);
    }
  };

  const handleTap = (p: Point) => {
    const now = performance.now();
    const prev = lastTap.current;
    if (prev && now - prev.at < DOUBLE_TAP_MS && distance(prev.point, p) < DOUBLE_TAP_SLOP) {
      lastTap.current = null;
      const next = doubleTapTransform(transform.current, p, stageSize(), contentRect());
      applyZoom(next, true);
      setZoomed(next.scale > 1);
    } else {
      lastTap.current = { at: now, point: p };
    }
  };

  const onPointerEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    const p = toStage(e);
    pointers.current.delete(e.pointerId);
    const g = gesture.current;

    if (g.kind === 'pinch') {
      if (pointers.current.size === 1) {
        // One finger lifted: keep panning with the other.
        const [rest] = [...pointers.current.values()];
        gesture.current = { kind: 'pan', start: rest, from: transform.current };
        return;
      }
      const next = settleTransform(transform.current, g.mid, stageSize(), contentRect());
      applyZoom(next, true);
      setZoomed(next.scale > 1);
      gesture.current = { kind: 'idle' };
      return;
    }
    if (pointers.current.size > 0) return;
    gesture.current = { kind: 'idle' };
    const cancelled = e.type === 'pointercancel';

    if (g.kind === 'pending') {
      if (!cancelled) handleTap(p);
    } else if (g.kind === 'pan') {
      setZoomed(transform.current.scale > 1);
    } else if (g.kind === 'swipe-x') {
      const dx = p.x - g.start.x;
      const v = velocity.current.x;
      const width = stageSize().width;
      let next = indexRef.current;
      if (!cancelled && (dx < -width * SWIPE_COMMIT || v < -SWIPE_VELOCITY)) next += 1;
      else if (!cancelled && (dx > width * SWIPE_COMMIT || v > SWIPE_VELOCITY)) next -= 1;
      goTo(next);
    } else if (g.kind === 'swipe-y') {
      const dy = p.y - g.start.y;
      if (!cancelled && (dy > CLOSE_DISTANCE || (dy > SLOP * 2 && velocity.current.y > CLOSE_VELOCITY))) {
        onRequestClose();
      } else {
        applyDismiss(0, true);
      }
    }
  };

  const onImageLoad = (i: number) => (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    naturalSizes.current.set(i, { width: img.naturalWidth, height: img.naturalHeight });
  };

  return (
    <div
      ref={rootRef}
      className="fixed inset-0 z-[100] flex touch-none select-none flex-col overscroll-none text-white"
      role="dialog"
      aria-modal="true"
      aria-label="Image viewer"
    >
      <div ref={backdropRef} aria-hidden className="absolute inset-0 bg-black" />

      <div className="relative z-10 flex items-center justify-between pt-[max(0.5rem,env(safe-area-inset-top))] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(0.5rem,env(safe-area-inset-right))]">
        <span className="text-sm text-white/80 tabular-nums" aria-live="polite">
          {index + 1} / {count}
        </span>
        <button
          ref={closeRef}
          type="button"
          onClick={onRequestClose}
          aria-label="Close image viewer"
          className="flex h-11 w-11 items-center justify-center rounded-full text-white/90 transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
        >
          <X className="h-6 w-6" />
        </button>
      </div>

      <div
        ref={stageRef}
        className="relative z-0 flex-1 overflow-hidden"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
      >
        <div ref={trackRef} className="flex h-full w-full will-change-transform">
          {images.map((img, i) => (
            <div key={img.url + i} className="relative h-full w-full shrink-0 overflow-hidden">
              <div data-zoom className="absolute inset-0 origin-top-left will-change-transform">
                <Image
                  src={img.url}
                  alt={img.alt}
                  fill
                  draggable={false}
                  className="object-contain"
                  // Once zoomed, ask for a sharper rendition; the fitted one
                  // stays on screen until it arrives.
                  sizes={zoomed && i === index ? '300vw' : '100vw'}
                  priority={i === index}
                  onLoad={onImageLoad(i)}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {count > 1 && (
        <>
          {/* Desktop arrows — touch swipes. Outside the stage so its pointer
              capture never swallows their clicks. */}
          <button
            type="button"
            onClick={() => goTo(index - 1)}
            aria-label="Previous image"
            disabled={index === 0 || zoomed}
            className="absolute left-4 top-1/2 z-10 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition-opacity hover:bg-white/20 disabled:opacity-0 sm:flex"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          <button
            type="button"
            onClick={() => goTo(index + 1)}
            aria-label="Next image"
            disabled={index === count - 1 || zoomed}
            className="absolute right-4 top-1/2 z-10 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition-opacity hover:bg-white/20 disabled:opacity-0 sm:flex"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        </>
      )}

      <p className="relative z-10 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-center text-xs text-white/60">
        {zoomed ? 'Drag to look around · double-tap to zoom out' : 'Pinch or double-tap to zoom · swipe down to close'}
      </p>
    </div>
  );
}
