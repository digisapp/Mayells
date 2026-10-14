import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type Stripe from 'stripe';

/**
 * The Stripe webhook handler's money paths that must never go wrong: a card
 * payment arriving on an invoice already marked paid by hand is held for an
 * admin (not auto-refunded), a true double charge IS refunded, a payout
 * failure fails the webhook so Stripe redelivers, and a failed delayed
 * payment releases its dead Checkout session. The DB is a recording stub.
 */

const h = vi.hoisted(() => {
  const selectResults: unknown[][] = [];
  const updateReturning: unknown[][] = [];
  const inserted: Record<string, unknown>[] = [];
  const updates: Record<string, unknown>[] = [];
  // A chainable, awaitable query stub; results are handed out in call order.
  function chain(result: () => unknown) {
    const c: Record<string, unknown> = {};
    const self = () => c;
    for (const m of ['from', 'where', 'orderBy', 'limit', 'leftJoin', 'innerJoin', 'onConflictDoNothing']) c[m] = self;
    c.set = (v: Record<string, unknown>) => { updates.push(v); return c; };
    c.values = (v: Record<string, unknown>) => { inserted.push(v); return c; };
    c.returning = () => Promise.resolve(result());
    c.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(result()).then(res, rej);
    return c;
  }
  // Every column renders as its own name.
  const table = () => new Proxy({}, { get: (_t, k) => (typeof k === 'string' ? k : undefined) });
  return {
    selectResults,
    updateReturning,
    inserted,
    updates,
    table,
    db: {
      select: () => chain(() => selectResults.shift() ?? []),
      insert: () => chain(() => []),
      update: () => chain(() => updateReturning.shift() ?? []),
    },
    stripe: {
      charges: { retrieve: vi.fn() },
      refunds: { create: vi.fn() },
      checkout: { sessions: { retrieve: vi.fn(), list: vi.fn() } },
      paymentIntents: { retrieve: vi.fn() },
    },
    processPaidInvoice: vi.fn(),
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  };
});

vi.mock('@/db', () => ({ db: h.db }));
vi.mock('@/db/schema', () => ({
  invoices: h.table(),
  payments: h.table(),
  lots: h.table(),
  users: h.table(),
  shipments: h.table(),
}));
vi.mock('@/lib/stripe/config', () => ({ stripe: h.stripe }));
vi.mock('@/lib/payouts/service', () => ({ processPaidInvoice: h.processPaidInvoice }));
vi.mock('@/lib/invoicing/unwind', () => ({
  unwindPaidInvoice: vi.fn(),
  stampNote: (prefix: string, reason: string) => `${prefix}: ${reason}`,
}));
vi.mock('@/lib/bidding/verification', () => ({ ensurePaddleNumber: vi.fn() }));
vi.mock('@/lib/logger', () => ({ logger: h.logger }));

import { handleStripeEvent } from '../handlers';

const { selectResults, updateReturning, inserted, updates, stripe, processPaidInvoice, logger } = h;

function invoice(overrides: Record<string, unknown> = {}) {
  return {
    id: 'inv-1',
    buyerId: 'buyer-1',
    lotId: 'lot-1',
    status: 'paid',
    totalAmount: 100_000,
    stripePaymentIntentId: null,
    stripeCheckoutSessionId: 'cs_1',
    shippingAddress: '{"line1":"1 Main St"}',
    ...overrides,
  };
}

function succeeded(id: string) {
  return {
    id: 'evt_1',
    type: 'payment_intent.succeeded',
    data: {
      object: {
        id,
        amount: 100_000,
        currency: 'usd',
        latest_charge: 'ch_1',
        metadata: { invoiceId: 'inv-1', lotId: 'lot-1' },
      },
    },
  } as unknown as Stripe.Event;
}

const hasNote = () => updates.some((u) => 'notes' in u);

beforeEach(() => {
  stripe.charges.retrieve.mockResolvedValue({ refunded: false });
  stripe.refunds.create.mockResolvedValue({ id: 're_1', amount: 100_000 });
  processPaidInvoice.mockResolvedValue({ payoutError: null });
});

afterEach(() => {
  vi.clearAllMocks();
  selectResults.length = 0;
  updateReturning.length = 0;
  inserted.length = 0;
  updates.length = 0;
});

describe('payment_intent.succeeded on an invoice that is no longer payable', () => {
  it('holds a card payment on an invoice marked paid by hand — records it, notes it, never refunds', async () => {
    selectResults.push(
      [invoice()], // the invoice
      [], // no payments row for this intent yet
      [{ method: 'wire', reference: 'W-1' }], // the manual payment of record
      [], // upsertSucceededPayment: nothing to update
    );
    updateReturning.push([]); // the paid CAS matches nothing

    const result = await handleStripeEvent(succeeded('pi_card'));

    expect(result).toEqual({ status: 'success', relatedType: 'invoice', relatedId: 'inv-1' });
    expect(stripe.refunds.create).not.toHaveBeenCalled();
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({ method: 'credit_card', stripePaymentIntentId: 'pi_card', status: 'succeeded' });
    expect(hasNote()).toBe(true);
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('NOT auto-refunded'), undefined, expect.anything());
  });

  it('keeps holding it when Stripe redelivers the same payment', async () => {
    selectResults.push(
      [invoice()],
      [{ id: 'pay-card' }], // already recorded by the first delivery
    );
    updateReturning.push([]);

    await handleStripeEvent(succeeded('pi_card'));

    expect(stripe.refunds.create).not.toHaveBeenCalled();
  });

  it('auto-refunds a true double charge (paid by a different card payment)', async () => {
    selectResults.push(
      [invoice({ stripePaymentIntentId: 'pi_first' })],
      [], // no row for the second intent
      [], // upsertSucceededPayment
    );
    updateReturning.push([]);

    await handleStripeEvent(succeeded('pi_second'));

    expect(inserted[0]).toMatchObject({ stripePaymentIntentId: 'pi_second' });
    expect(stripe.refunds.create).toHaveBeenCalledWith(
      { payment_intent: 'pi_second', reason: 'duplicate' },
      { idempotencyKey: 'auto-refund:pi_second' },
    );
  });

  it('auto-refunds a charge on a cancelled invoice', async () => {
    selectResults.push([invoice({ status: 'cancelled' })], [], []);
    updateReturning.push([]);

    await handleStripeEvent(succeeded('pi_late'));

    expect(stripe.refunds.create).toHaveBeenCalledTimes(1);
  });
});

describe('settlement after a card payment', () => {
  it('runs the seller-side settlement strictly, so a payout failure fails the webhook', async () => {
    selectResults.push(
      [invoice({ status: 'pending' })],
      [], // upsertSucceededPayment
    );
    updateReturning.push([{ id: 'inv-1' }]); // pending → paid
    processPaidInvoice.mockRejectedValue(new Error('payout insert failed'));

    await expect(handleStripeEvent(succeeded('pi_ok'))).rejects.toThrow('payout insert failed');
    expect(processPaidInvoice).toHaveBeenCalledWith('inv-1', { sendBuyerConfirmation: true, strict: true });
  });

  it('re-runs the settlement strictly on redelivery', async () => {
    selectResults.push(
      [invoice({ stripePaymentIntentId: 'pi_ok' })],
      [{ id: 'pay-1' }],
    );
    updateReturning.push([]);

    await handleStripeEvent(succeeded('pi_ok'));

    expect(processPaidInvoice).toHaveBeenCalledWith('inv-1', { strict: true });
    expect(stripe.refunds.create).not.toHaveBeenCalled();
  });
});

describe('payment_intent.payment_failed', () => {
  function failed() {
    return {
      id: 'evt_2',
      type: 'payment_intent.payment_failed',
      data: {
        object: {
          id: 'pi_ach',
          metadata: { invoiceId: 'inv-1' },
          last_payment_error: { message: 'Insufficient funds' },
        },
      },
    } as unknown as Stripe.Event;
  }

  it('forgets a completed session whose payment failed, so the buyer can pay again', async () => {
    selectResults.push(
      [], // no payments row
      [{ sessionId: 'cs_1' }],
    );
    stripe.checkout.sessions.retrieve.mockResolvedValue({ status: 'complete', payment_intent: 'pi_ach' });

    await handleStripeEvent(failed());

    expect(updates).toContainEqual(expect.objectContaining({ stripeCheckoutSessionId: null }));
  });

  it('keeps an open session (a card declined on Stripe’s page is retried there)', async () => {
    selectResults.push([], [{ sessionId: 'cs_1' }]);
    stripe.checkout.sessions.retrieve.mockResolvedValue({ status: 'open', payment_intent: 'pi_ach' });

    await handleStripeEvent(failed());

    expect(updates).toHaveLength(0);
  });

  it('keeps a session that belongs to a different payment', async () => {
    selectResults.push([], [{ sessionId: 'cs_1' }]);
    stripe.checkout.sessions.retrieve.mockResolvedValue({ status: 'complete', payment_intent: 'pi_other' });

    await handleStripeEvent(failed());

    expect(updates).toHaveLength(0);
  });
});
