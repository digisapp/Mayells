import { describe, it, expect, vi, afterEach } from 'vitest';
import { advanceVisible, orAfterVisible, startVisibleTimer, type PageClock } from '../visible-time';

/** A clock the test moves by hand, with a page it can hide. */
function fakePage() {
  const page = { visible: true };
  const clock: PageClock = { now: () => Date.now(), visible: () => page.visible };
  return { page, clock };
}

afterEach(() => vi.useRealTimers());

describe('advanceVisible', () => {
  it('counts time only while the page is on screen', () => {
    expect(advanceVisible(100, 1000, 1250, true, 500)).toBe(350);
    expect(advanceVisible(100, 1000, 1250, false, 500)).toBe(100);
  });

  it('counts a frozen page’s gap as one step, not minutes', () => {
    expect(advanceVisible(0, 0, 5 * 60_000, true, 500)).toBe(500);
  });

  it('ignores a clock that went backwards', () => {
    expect(advanceVisible(100, 2000, 1000, true, 500)).toBe(100);
  });
});

describe('startVisibleTimer', () => {
  it('fires once the time has passed on screen', () => {
    vi.useFakeTimers();
    const { clock } = fakePage();
    const onExpire = vi.fn();
    startVisibleTimer(1000, onExpire, clock);
    vi.advanceTimersByTime(900);
    expect(onExpire).not.toHaveBeenCalled();
    vi.advanceTimersByTime(200);
    expect(onExpire).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(5000);
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it('does not run down while the phone is locked', () => {
    vi.useFakeTimers();
    const { page, clock } = fakePage();
    const onExpire = vi.fn();
    startVisibleTimer(1000, onExpire, clock);
    vi.advanceTimersByTime(500);
    page.visible = false;
    vi.advanceTimersByTime(60_000);
    expect(onExpire).not.toHaveBeenCalled();
    page.visible = true;
    vi.advanceTimersByTime(400);
    expect(onExpire).not.toHaveBeenCalled();
    vi.advanceTimersByTime(200);
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it('does not fire the moment a frozen page resumes', () => {
    vi.useFakeTimers();
    const { clock } = fakePage();
    const onExpire = vi.fn();
    startVisibleTimer(1000, onExpire, clock);
    // iOS froze the tab: no timer ran, then the wall clock jumped.
    vi.setSystemTime(Date.now() + 10 * 60_000);
    vi.advanceTimersByTime(250);
    expect(onExpire).not.toHaveBeenCalled();
  });

  it('can be cancelled', () => {
    vi.useFakeTimers();
    const onExpire = vi.fn();
    const cancel = startVisibleTimer(1000, onExpire, fakePage().clock);
    cancel();
    vi.advanceTimersByTime(5000);
    expect(onExpire).not.toHaveBeenCalled();
  });
});

describe('orAfterVisible', () => {
  it('resolves with the work when it finishes in time', async () => {
    await expect(orAfterVisible(Promise.resolve('done'), 1000, 'fallback')).resolves.toBe('done');
  });

  it('resolves with the fallback when it does not', async () => {
    vi.useFakeTimers();
    const pending = orAfterVisible(new Promise<string>(() => {}), 1000, 'fallback', fakePage().clock);
    vi.advanceTimersByTime(1250);
    await expect(pending).resolves.toBe('fallback');
  });
});
