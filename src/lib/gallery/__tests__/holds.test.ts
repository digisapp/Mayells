import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Stripe from 'stripe';

/**
 * Releasing a Buy Now hold must never cancel an invoice whose Stripe
 * session can still take (or has taken) the money: that would turn a real
 * purchase into a stray charge. The DB is a recording stub.
 */

const h = vi.hoisted(() => {
  const updateResults: unknown[][] = [];
  const updates: Record<string, unknown>[] = [];
  const selectResults: unknown[][] = [];
  function chain(result: () => unknown) {
    const c: Record<string, unknown> = {};
    const self = () => c;
    for (const m of ['from', 'where', 'orderBy', 'limit']) c[m] = self;
    c.set = (v: Record<string, unknown>) => { updates.push(v); return c; };
    c.returning = () => Promise.resolve(result());
    c.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(result()).then(res, rej);
    return c;
  }
  const table = () => new Proxy({}, { get: (_t, k) => (typeof k === 'string' ? k : undefined) });
  return {
    updateResults,
    updates,
    selectResults,
    table,
    db: {
      update: () => chain(() => updateResults.shift() ?? []),
      select: () => chain(() => selectResults.shift() ?? []),
    },
    stripe: { checkout: { sessions: { retrieve: vi.fn(), expire: vi.fn() } } },
    configured: { value: true },
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  };
});

vi.mock('@/db', () => ({ db: h.db }));
vi.mock('@/db/schema', () => ({ invoices: h.table() }));
vi.mock('@/lib/stripe/config', () => ({ stripe: h.stripe, isStripeConfigured: () => h.configured.value }));
vi.mock('@/lib/invoicing/unwind', () => ({ stampNote: (p: string, r: string) => `${p}: ${r}` }));
vi.mock('@/lib/logger', () => ({ logger: h.logger }));

import { releaseGalleryHold, releaseLapsedGalleryHolds, ORPHAN_HOLD_GRACE_MS } from '../holds';

const NOW = new Date('2026-10-22T15:00:00Z');
const lapsed = new Date(NOW.getTime() - 60_000);

function hold(overrides: Record<string, unknown> = {}) {
  return { id: 'inv-1', status: 'pending', holdExpiresAt: lapsed, stripeCheckoutSessionId: 'cs_1', ...overrides } as {
    id: string;
    status: string;
    holdExpiresAt: Date | null;
    stripeCheckoutSessionId: string | null;
  };
}

const cancelled = () => h.updates.some((u) => u.status === 'cancelled');

beforeEach(() => {
  h.configured.value = true;
});

afterEach(() => {
  vi.clearAllMocks();
  h.updateResults.length = 0;
  h.updates.length = 0;
  h.selectResults.length = 0;
});

describe('releaseGalleryHold', () => {
  it('cancels the hold once Stripe reports its session expired', async () => {
    h.stripe.checkout.sessions.retrieve.mockResolvedValue({ status: 'expired', payment_status: 'unpaid', payment_intent: null });
    h.updateResults.push([{ id: 'inv-1' }]);
    await expect(releaseGalleryHold(hold(), 'lapsed', { now: NOW })).resolves.toBe('released');
    expect(cancelled()).toBe(true);
    expect(h.stripe.checkout.sessions.expire).not.toHaveBeenCalled();
  });

  it('expires a session Stripe still has open before cancelling', async () => {
    h.stripe.checkout.sessions.retrieve.mockResolvedValue({ id: 'cs_1', status: 'open', payment_status: 'unpaid', payment_intent: null });
    h.stripe.checkout.sessions.expire.mockResolvedValue({ id: 'cs_1', status: 'expired', payment_status: 'unpaid', payment_intent: null });
    h.updateResults.push([{ id: 'inv-1' }]);
    await expect(releaseGalleryHold(hold(), 'lapsed', { now: NOW })).resolves.toBe('released');
    expect(h.stripe.checkout.sessions.expire).toHaveBeenCalledWith('cs_1', undefined, { idempotencyKey: 'expire:cs_1' });
    expect(cancelled()).toBe(true);
  });

  it('never cancels a hold whose session took the payment', async () => {
    h.stripe.checkout.sessions.retrieve.mockResolvedValue({ status: 'complete', payment_status: 'paid', payment_intent: { status: 'succeeded' } });
    await expect(releaseGalleryHold(hold(), 'lapsed', { now: NOW })).resolves.toBe('paying');
    expect(cancelled()).toBe(false);
  });

  it('cancels a completed session whose payment failed afterwards', async () => {
    h.stripe.checkout.sessions.retrieve.mockResolvedValue({ status: 'complete', payment_status: 'unpaid', payment_intent: { status: 'requires_payment_method' } });
    h.updateResults.push([{ id: 'inv-1' }]);
    await expect(releaseGalleryHold(hold(), 'lapsed', { now: NOW })).resolves.toBe('released');
  });

  it('waits when Stripe cannot be reached', async () => {
    h.stripe.checkout.sessions.retrieve.mockRejectedValue(new Error('ECONNRESET'));
    await expect(releaseGalleryHold(hold(), 'lapsed', { now: NOW })).resolves.toBe('unknown');
    expect(cancelled()).toBe(false);
  });

  it('cancels when Stripe does not know the session', async () => {
    h.stripe.checkout.sessions.retrieve.mockRejectedValue(
      new Stripe.errors.StripeInvalidRequestError({ type: 'invalid_request_error', code: 'resource_missing', message: 'No such checkout session' }),
    );
    h.updateResults.push([{ id: 'inv-1' }]);
    await expect(releaseGalleryHold(hold(), 'lapsed', { now: NOW })).resolves.toBe('released');
  });

  it('leaves a hold that has not lapsed alone unless forced', async () => {
    const live = hold({ holdExpiresAt: new Date(NOW.getTime() + 60_000) });
    await expect(releaseGalleryHold(live, 'early', { now: NOW })).resolves.toBe('unknown');
    expect(h.stripe.checkout.sessions.retrieve).not.toHaveBeenCalled();
  });

  it('gives a hold with no session on record a grace period before cancelling it', async () => {
    const orphan = hold({ stripeCheckoutSessionId: null });
    await expect(releaseGalleryHold(orphan, 'lapsed', { now: NOW })).resolves.toBe('unknown');
    h.updateResults.push([{ id: 'inv-1' }]);
    const later = new Date(lapsed.getTime() + ORPHAN_HOLD_GRACE_MS + 1);
    await expect(releaseGalleryHold(orphan, 'lapsed', { now: later })).resolves.toBe('released');
  });

  it('ignores anything that is not a pending hold', async () => {
    await expect(releaseGalleryHold(hold({ status: 'paid' }), 'x', { now: NOW })).resolves.toBe('not_held');
    await expect(releaseGalleryHold(hold({ holdExpiresAt: null }), 'x', { now: NOW })).resolves.toBe('not_held');
  });

  it('reports not_held when a payment flipped the invoice first (the compare-and-swap missed)', async () => {
    h.stripe.checkout.sessions.retrieve.mockResolvedValue({ status: 'expired', payment_status: 'unpaid', payment_intent: null });
    h.updateResults.push([]);
    await expect(releaseGalleryHold(hold(), 'lapsed', { now: NOW })).resolves.toBe('not_held');
  });
});

describe('releaseLapsedGalleryHolds', () => {
  it('counts what it released and flags a paid hold the webhook never recorded', async () => {
    const longAgo = new Date(NOW.getTime() - 30 * 60 * 1000);
    h.selectResults.push([
      hold({ id: 'a' }),
      hold({ id: 'b', holdExpiresAt: longAgo, stripeCheckoutSessionId: 'cs_b' }),
    ]);
    h.stripe.checkout.sessions.retrieve
      .mockResolvedValueOnce({ status: 'expired', payment_status: 'unpaid', payment_intent: null })
      .mockResolvedValueOnce({ status: 'complete', payment_status: 'paid', payment_intent: { status: 'succeeded' } });
    h.updateResults.push([{ id: 'a' }]);
    await expect(releaseLapsedGalleryHolds(NOW)).resolves.toEqual({ released: 1, paying: 1, pending: 0 });
    expect(h.logger.error).toHaveBeenCalledWith(expect.stringContaining('never marked paid'), undefined, expect.objectContaining({ invoiceId: 'b' }));
  });
});
