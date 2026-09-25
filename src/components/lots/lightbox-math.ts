/**
 * Geometry for the lot image viewer's own pinch / pan / double-tap zoom.
 *
 * A transform is `translate(x, y) scale(scale)` with the origin at the
 * stage's top-left corner, so a content point p is drawn at `t + scale * p`.
 * All coordinates are CSS px relative to the stage.
 */

export interface Transform {
  scale: number;
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Rect extends Size {
  x: number;
  y: number;
}

export interface Point {
  x: number;
  y: number;
}

export const IDENTITY: Transform = { scale: 1, x: 0, y: 0 };
export const MIN_SCALE = 1;
export const MAX_SCALE = 4;
/** How far a pinch may overshoot before it springs back on release. */
export const GESTURE_MIN_SCALE = 0.8;
export const GESTURE_MAX_SCALE = 5;
export const DOUBLE_TAP_SCALE = 2.5;

export const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/**
 * Where an `object-contain` image sits inside the stage at scale 1. Without
 * the natural size yet, assume it fills the stage.
 */
export function containRect(stage: Size, natural: Size | null): Rect {
  if (!natural || !natural.width || !natural.height) return { x: 0, y: 0, ...stage };
  const fit = Math.min(stage.width / natural.width, stage.height / natural.height);
  const width = natural.width * fit;
  const height = natural.height * fit;
  return { x: (stage.width - width) / 2, y: (stage.height - height) / 2, width, height };
}

/** Scale about `focal` so the content point under it stays under it. */
export function zoomAt(t: Transform, focal: Point, scale: number): Transform {
  const k = scale / t.scale;
  return { scale, x: focal.x - k * (focal.x - t.x), y: focal.y - k * (focal.y - t.y) };
}

// One axis: an image smaller than the stage stays centred; a larger one may
// not pull its edge inside the stage (no empty gutter while panning).
function clampAxis(pos: number, scale: number, stageLen: number, start: number, len: number): number {
  const drawn = scale * len;
  if (drawn <= stageLen) return (stageLen - drawn) / 2 - scale * start;
  return clamp(pos, stageLen - scale * (start + len), -scale * start);
}

/** Keep the image covering the stage wherever it can. */
export function clampTransform(t: Transform, stage: Size, content: Rect): Transform {
  return {
    scale: t.scale,
    x: clampAxis(t.x, t.scale, stage.width, content.x, content.width),
    y: clampAxis(t.y, t.scale, stage.height, content.y, content.height),
  };
}

/**
 * A two-finger frame: start from `from`, scale by the finger-spread ratio
 * about the starting midpoint, then follow the midpoint's travel.
 */
export function pinchTransform(
  from: Transform,
  start: { mid: Point; distance: number },
  now: { mid: Point; distance: number },
): Transform {
  const scale = clamp((from.scale * now.distance) / Math.max(start.distance, 1), GESTURE_MIN_SCALE, GESTURE_MAX_SCALE);
  const zoomed = zoomAt(from, start.mid, scale);
  return { scale, x: zoomed.x + (now.mid.x - start.mid.x), y: zoomed.y + (now.mid.y - start.mid.y) };
}

/** Where a gesture comes to rest: scale back inside its limits, edges clamped. */
export function settleTransform(t: Transform, focal: Point, stage: Size, content: Rect): Transform {
  const scale = clamp(t.scale, MIN_SCALE, MAX_SCALE);
  if (scale <= MIN_SCALE + 0.01) return IDENTITY;
  return clampTransform(scale === t.scale ? t : zoomAt(t, focal, scale), stage, content);
}

/** Double-tap: zoom in toward the tapped point, or back out if already zoomed. */
export function doubleTapTransform(t: Transform, tap: Point, stage: Size, content: Rect): Transform {
  if (t.scale > MIN_SCALE + 0.01) return IDENTITY;
  return clampTransform(zoomAt(t, tap, DOUBLE_TAP_SCALE), stage, content);
}

export const toCss = (t: Transform) => `translate3d(${t.x}px, ${t.y}px, 0) scale(${t.scale})`;
