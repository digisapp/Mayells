import { describe, it, expect } from 'vitest';
import {
  IDENTITY,
  MAX_SCALE,
  clampTransform,
  containRect,
  doubleTapTransform,
  pinchTransform,
  settleTransform,
  zoomAt,
  type Transform,
} from '../lightbox-math';

const stage = { width: 400, height: 800 };
// A landscape photo letterboxed in a portrait phone stage: 400×300 at scale 1.
const landscape = containRect(stage, { width: 1600, height: 1200 });
/** Where content point p lands on screen. */
const project = (t: Transform, p: { x: number; y: number }) => ({ x: t.x + t.scale * p.x, y: t.y + t.scale * p.y });

describe('containRect', () => {
  it('letterboxes like object-contain', () => {
    expect(landscape).toEqual({ x: 0, y: 250, width: 400, height: 300 });
  });
  it('assumes a full-stage image until the natural size is known', () => {
    expect(containRect(stage, null)).toEqual({ x: 0, y: 0, width: 400, height: 800 });
  });
});

describe('zoomAt', () => {
  it('keeps the content under the focal point fixed', () => {
    const focal = { x: 300, y: 400 };
    const before = { x: 300, y: 400 }; // identity: content point == screen point
    const t = zoomAt(IDENTITY, focal, 2);
    expect(project(t, before)).toEqual(focal);
  });
});

describe('doubleTapTransform', () => {
  it('zooms toward the tapped point, not the top-left corner', () => {
    // A full-bleed image overflows both axes at 2.5×, so nothing is clamped.
    const tap = { x: 320, y: 420 };
    const t = doubleTapTransform(IDENTITY, tap, stage, containRect(stage, null));
    expect(t.scale).toBeGreaterThan(1);
    // The tapped detail stays under the finger.
    const p = project(t, tap);
    expect(p.x).toBeCloseTo(tap.x);
    expect(p.y).toBeCloseTo(tap.y);
  });

  it('clamps so a tap near an edge never exposes a gutter', () => {
    const t = doubleTapTransform(IDENTITY, { x: 395, y: 260 }, stage, landscape);
    // Right edge of the image may not come inside the stage.
    expect(t.x + t.scale * (landscape.x + landscape.width)).toBeGreaterThanOrEqual(stage.width - 0.001);
    expect(t.x + t.scale * landscape.x).toBeLessThanOrEqual(0.001);
  });

  it('zooms back out when already zoomed', () => {
    expect(doubleTapTransform({ scale: 2.5, x: -100, y: -300 }, { x: 10, y: 10 }, stage, landscape)).toEqual(IDENTITY);
  });
});

describe('clampTransform', () => {
  it('centres an axis the zoomed image still does not fill', () => {
    // At 2× the 300px-tall image is 600px: less than the 800px stage, so it centres vertically.
    const t = clampTransform({ scale: 2, x: -50, y: 9999 }, stage, landscape);
    expect(t.y + 2 * landscape.y + (2 * landscape.height) / 2).toBeCloseTo(stage.height / 2);
  });

  it('stops panning at the image edge', () => {
    const t = clampTransform({ scale: 2, x: 500, y: 0 }, stage, landscape);
    expect(t.x).toBeCloseTo(0); // left edge pinned to the stage's left edge
    const u = clampTransform({ scale: 2, x: -5000, y: 0 }, stage, landscape);
    expect(u.x).toBe(stage.width - 2 * landscape.width); // right edge pinned
  });
});

describe('pinchTransform', () => {
  it('scales by the finger spread about the starting midpoint', () => {
    const start = { mid: { x: 200, y: 400 }, distance: 100 };
    const t = pinchTransform(IDENTITY, start, { mid: { x: 200, y: 400 }, distance: 200 });
    expect(t.scale).toBe(2);
    expect(project(t, { x: 200, y: 400 })).toEqual({ x: 200, y: 400 });
  });

  it('follows the midpoint as the fingers travel', () => {
    const start = { mid: { x: 200, y: 400 }, distance: 100 };
    const t = pinchTransform(IDENTITY, start, { mid: { x: 230, y: 380 }, distance: 100 });
    expect(t).toEqual({ scale: 1, x: 30, y: -20 });
  });

  it('bounds the overshoot', () => {
    const start = { mid: { x: 0, y: 0 }, distance: 10 };
    expect(pinchTransform(IDENTITY, start, { mid: { x: 0, y: 0 }, distance: 1000 }).scale).toBe(5);
    expect(pinchTransform(IDENTITY, start, { mid: { x: 0, y: 0 }, distance: 1 }).scale).toBe(0.8);
  });
});

describe('settleTransform', () => {
  it('springs an over-pinch back to the maximum', () => {
    const t = settleTransform({ scale: 5, x: -600, y: -1200 }, { x: 200, y: 400 }, stage, landscape);
    expect(t.scale).toBe(MAX_SCALE);
  });

  it('snaps an under-pinch back to the fitted image', () => {
    expect(settleTransform({ scale: 0.85, x: 30, y: 60 }, { x: 200, y: 400 }, stage, landscape)).toEqual(IDENTITY);
  });
});
