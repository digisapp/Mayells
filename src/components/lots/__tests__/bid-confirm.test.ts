import { describe, it, expect } from 'vitest';
import {
  attemptFor,
  bidSignature,
  effectiveMinimum,
  planConfirm,
  raiseFloor,
  type Attempt,
} from '../bid-confirm';

const LOT = 'abstract-landscape';
let keys = 0;
const newKey = () => `key-${++keys}`;

describe('planConfirm', () => {
  it('confirms exactly the chosen bid while it still meets the minimum', () => {
    const plan = planConfirm({ lotRef: LOT, pending: { amount: 100_000 }, minimum: 100_000, unanswered: null });
    expect(plan.kind).toBe('confirm');
    expect(plan.send).toEqual({ amount: 100_000 });
    expect(plan.label).toBe('Confirm $1,000');
    expect(plan.notice).toBeNull();
    expect(plan.earlierUnconfirmed).toBe(false);
  });

  it('refuses to auto-raise: a rival bid withdraws Confirm and re-offers the new minimum as its own choice', () => {
    const plan = planConfirm({ lotRef: LOT, pending: { amount: 100_000 }, minimum: 110_000, unanswered: null });
    expect(plan.kind).toBe('reoffer');
    // Nothing labelled "Confirm" survives, and the only action names the amount it sends.
    expect(plan.label).toBe('Bid $1,100 instead');
    expect(plan.send).toEqual({ amount: 110_000 });
    expect(plan.shown).toEqual({ amount: 110_000 });
    expect(plan.notice).toBe('Another bid came in. The minimum is now $1,100.');
  });

  it('carries the proxy max into the re-offer while it still covers the minimum', () => {
    const plan = planConfirm({ lotRef: LOT, pending: { amount: 100_000, max: 150_000 }, minimum: 110_000, unanswered: null });
    expect(plan.kind).toBe('reoffer');
    expect(plan.send).toEqual({ amount: 110_000, max: 150_000 });
  });

  it('blocks when the proxy max falls below the new minimum', () => {
    const plan = planConfirm({ lotRef: LOT, pending: { amount: 100_000, max: 105_000 }, minimum: 110_000, unanswered: null });
    expect(plan.kind).toBe('blocked');
    expect(plan.send).toBeNull();
    expect(plan.label).toBeNull();
    expect(plan.shown).toEqual({ amount: 100_000, max: 105_000 });
    expect(plan.notice).toMatch(/above your maximum/);
  });

  it('after an unanswered send, offers the same bid again (not a higher one) even once the minimum has passed it', () => {
    const pending = { amount: 100_000 };
    const plan = planConfirm({ lotRef: LOT, pending, minimum: 110_000, unanswered: { lotRef: LOT, bid: pending } });
    expect(plan.kind).toBe('retry');
    expect(plan.send).toEqual(pending);
    expect(plan.label).toBe('Retry $1,000');
    // The minimum-moved news shows alongside the unconfirmed one.
    expect(plan.notice).toMatch(/couldn’t confirm your \$1,000 bid/);
    expect(plan.notice).toMatch(/minimum is now \$1,100/);
  });

  it('after an unanswered send at a still-valid amount, Confirm resends it and says why', () => {
    const pending = { amount: 100_000 };
    const plan = planConfirm({ lotRef: LOT, pending, minimum: 100_000, unanswered: { lotRef: LOT, bid: pending } });
    expect(plan.kind).toBe('confirm');
    expect(plan.label).toBe('Confirm $1,000');
    expect(plan.notice).toMatch(/can’t be placed twice/);
    expect(plan.earlierUnconfirmed).toBe(false);
  });

  it('warns about the earlier unanswered bid when the bidder picks a different amount on the same lot', () => {
    const plan = planConfirm({
      lotRef: LOT,
      pending: { amount: 120_000 },
      minimum: 110_000,
      unanswered: { lotRef: LOT, bid: { amount: 100_000 } },
    });
    expect(plan.kind).toBe('confirm');
    expect(plan.earlierUnconfirmed).toBe(true);
  });

  it('keeps the minimum-moved notice alongside the earlier-bid warning', () => {
    const plan = planConfirm({
      lotRef: LOT,
      pending: { amount: 110_000 },
      minimum: 120_000,
      unanswered: { lotRef: LOT, bid: { amount: 100_000 } },
    });
    expect(plan.kind).toBe('reoffer');
    expect(plan.notice).toBe('Another bid came in. The minimum is now $1,200.');
    expect(plan.earlierUnconfirmed).toBe(true);
  });

  it("doesn't warn about an unanswered bid on another lot", () => {
    const plan = planConfirm({
      lotRef: LOT,
      pending: { amount: 100_000 },
      minimum: 100_000,
      unanswered: { lotRef: 'other-lot', bid: { amount: 100_000 } },
    });
    expect(plan.kind).toBe('confirm');
    expect(plan.notice).toBeNull();
    expect(plan.earlierUnconfirmed).toBe(false);
  });

  it('treats a different max as a different bid', () => {
    const plan = planConfirm({
      lotRef: LOT,
      pending: { amount: 100_000, max: 200_000 },
      minimum: 110_000,
      unanswered: { lotRef: LOT, bid: { amount: 100_000 } },
    });
    expect(plan.kind).toBe('reoffer');
    expect(plan.earlierUnconfirmed).toBe(true);
  });
});

describe('minimum floor after a rejection', () => {
  it("raises the form's minimum to the engine's at once, before the props catch up", () => {
    const floor = raiseFloor(null, LOT, 120_000);
    expect(effectiveMinimum(110_000, floor, LOT)).toBe(120_000);
    // Confirm withdrawn in favour of the engine's minimum.
    const plan = planConfirm({ lotRef: LOT, pending: { amount: 110_000 }, minimum: effectiveMinimum(110_000, floor, LOT), unanswered: null });
    expect(plan.kind).toBe('reoffer');
    expect(plan.send).toEqual({ amount: 120_000 });
  });

  it('never lowers the minimum, and gives way once the props reach or pass it', () => {
    const floor = raiseFloor(null, LOT, 120_000);
    expect(effectiveMinimum(120_000, floor, LOT)).toBe(120_000);
    expect(effectiveMinimum(130_000, floor, LOT)).toBe(130_000);
  });

  it('only ever rises for the same lot', () => {
    const first = raiseFloor(null, LOT, 120_000);
    expect(raiseFloor(first, LOT, 110_000).value).toBe(120_000);
    expect(raiseFloor(first, LOT, 130_000).value).toBe(130_000);
  });

  it("doesn't carry over to another lot", () => {
    const floor = raiseFloor(null, LOT, 120_000);
    expect(effectiveMinimum(50_000, floor, 'other-lot')).toBe(50_000);
    expect(raiseFloor(floor, 'other-lot', 60_000)).toEqual({ lotRef: 'other-lot', value: 60_000 });
  });
});

describe('idempotency keys', () => {
  it('reuses the key when the same bid is retried after a server error', () => {
    const first = attemptFor(null, bidSignature(LOT, { amount: 100_000 }), newKey);
    const retry = attemptFor(first, bidSignature(LOT, { amount: 100_000 }), newKey);
    expect(retry.key).toBe(first.key);
  });

  it('issues a new key for a new amount or a new max', () => {
    const first = attemptFor(null, bidSignature(LOT, { amount: 100_000 }), newKey);
    const higher = attemptFor(first, bidSignature(LOT, { amount: 110_000 }), newKey);
    const withMax = attemptFor(first, bidSignature(LOT, { amount: 100_000, max: 150_000 }), newKey);
    expect(higher.key).not.toBe(first.key);
    expect(withMax.key).not.toBe(first.key);
    expect(withMax.key).not.toBe(higher.key);
  });

  it('never replays a key across lots', () => {
    const first: Attempt = attemptFor(null, bidSignature(LOT, { amount: 100_000 }), newKey);
    const otherLot = attemptFor(first, bidSignature('other-lot', { amount: 100_000 }), newKey);
    expect(otherLot.key).not.toBe(first.key);
  });
});
