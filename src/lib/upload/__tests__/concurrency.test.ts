import { describe, it, expect } from 'vitest';
import { mapWithConcurrency } from '../concurrency';

const tick = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('mapWithConcurrency', () => {
  it('never runs more than `limit` at once, and keeps input order', async () => {
    let inFlight = 0;
    let peak = 0;
    const delays = [30, 5, 20, 1, 15, 10, 2];
    const out = await mapWithConcurrency(delays, 2, async (ms, i) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await tick(ms);
      inFlight--;
      return `#${i}:${ms}`;
    });
    expect(peak).toBe(2);
    expect(out).toEqual(delays.map((ms, i) => `#${i}:${ms}`));
  });

  it('reports each settled item', async () => {
    const seen: [number, number][] = [];
    await mapWithConcurrency([1, 2, 3], 2, async (n) => n, (done, total) => seen.push([done, total]));
    expect(seen).toEqual([[1, 3], [2, 3], [3, 3]]);
  });

  it('handles an empty list and a limit above the item count', async () => {
    expect(await mapWithConcurrency([], 2, async (n: number) => n)).toEqual([]);
    let peak = 0;
    let inFlight = 0;
    await mapWithConcurrency([1, 2], 10, async (n) => {
      peak = Math.max(peak, ++inFlight);
      await tick(1);
      inFlight--;
      return n;
    });
    expect(peak).toBe(2);
  });

  it('treats a limit below 1 as 1', async () => {
    let peak = 0;
    let inFlight = 0;
    await mapWithConcurrency([1, 2, 3], 0, async (n) => {
      peak = Math.max(peak, ++inFlight);
      await tick(1);
      inFlight--;
      return n;
    });
    expect(peak).toBe(1);
  });

  it('rejects with the first error and starts nothing further', async () => {
    const started: number[] = [];
    await expect(
      mapWithConcurrency([0, 1, 2, 3, 4], 1, async (n) => {
        started.push(n);
        if (n === 1) throw new Error('boom');
        return n;
      }),
    ).rejects.toThrow('boom');
    expect(started).toEqual([0, 1]);
  });
});
