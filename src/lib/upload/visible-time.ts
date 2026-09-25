// Timers that count only the time the page is on screen.
//
// iOS freezes a tab when the phone locks or the seller switches apps, and on
// return fires every timer that fell due meanwhile, all at once. A 30-second
// limit on preparing a photo then "runs out" the moment the phone is
// unlocked, although the work never had a chance to run, and two limits
// meant to be seconds apart fire back to back. These count in small steps,
// only while the page is visible, and never count more than a couple of
// steps across a gap (a frozen page), so a limit means that much time the
// page really had.

/** How often a timer checks the clock. Deadlines here are seconds long; this is precise enough. */
const STEP_MS = 250;

export interface PageClock {
  now(): number;
  visible(): boolean;
}

export const pageClock: PageClock = {
  now: () => Date.now(),
  visible: () => typeof document === 'undefined' || document.visibilityState !== 'hidden',
};

/**
 * Visible time elapsed after one step: `now - last` if the page is on
 * screen, capped at `maxStep` so a freeze counts as one step, not minutes.
 */
export function advanceVisible(elapsed: number, last: number, now: number, visible: boolean, maxStep: number): number {
  if (!visible) return elapsed;
  return elapsed + Math.min(Math.max(0, now - last), maxStep);
}

/** Call `onExpire` once `ms` of visible time has passed. Returns a cancel function. */
export function startVisibleTimer(ms: number, onExpire: () => void, clock: PageClock = pageClock): () => void {
  const step = Math.max(1, Math.min(STEP_MS, ms));
  let elapsed = 0;
  let last = clock.now();
  const timer = setInterval(() => {
    const now = clock.now();
    elapsed = advanceVisible(elapsed, last, now, clock.visible(), step * 2);
    last = now;
    if (elapsed >= ms) {
      clearInterval(timer);
      onExpire();
    }
  }, step);
  return () => clearInterval(timer);
}

/** `promise`'s value, or `fallback` once `ms` of visible time has passed. `promise` must not reject. */
export function orAfterVisible<T>(promise: Promise<T>, ms: number, fallback: T, clock: PageClock = pageClock): Promise<T> {
  return new Promise((resolve) => {
    const cancel = startVisibleTimer(ms, () => resolve(fallback), clock);
    promise.then((value) => {
      cancel();
      resolve(value);
    });
  });
}
