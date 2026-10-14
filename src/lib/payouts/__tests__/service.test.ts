import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * processPaidInvoice: a failure to record the consignor payout must not be
 * swallowed. Strict callers (the Stripe webhook) get it thrown — after the
 * other steps ran, so the buyer's receipt still goes out — and the admin path
 * gets it back as `payoutError`. The DB is a recording stub.
 */

const h = vi.hoisted(() => {
  const selectResults: unknown[][] = [];
  function chain(kind: 'select' | 'insert') {
    const c: Record<string, unknown> = {};
    const self = () => c;
    for (const m of ['from', 'where', 'limit', 'orderBy', 'values', 'onConflictDoNothing']) c[m] = self;
    c.returning = () => (kind === 'insert' ? Promise.reject(new Error('payout insert failed')) : Promise.resolve([]));
    c.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
      Promise.resolve(kind === 'select' ? selectResults.shift() ?? [] : []).then(res, rej);
    return c;
  }
  const table = () => new Proxy({}, { get: (_t, k) => (typeof k === 'string' ? k : undefined) });
  return {
    selectResults,
    table,
    findInvoice: vi.fn(),
    db: {
      select: () => chain('select'),
      insert: () => chain('insert'),
      query: { invoices: { findFirst: (...args: unknown[]) => h.findInvoice(...args) } },
    },
    sendPaymentConfirmation: vi.fn(),
    createShipmentForInvoice: vi.fn(),
  };
});

vi.mock('@/db', () => ({ db: h.db }));
vi.mock('@/db/schema', () => ({
  payouts: h.table(),
  consignments: h.table(),
  sellerProspects: h.table(),
  uploadItems: h.table(),
  shipments: h.table(),
  automationSettings: h.table(),
}));
vi.mock('@/lib/shipping/service', () => ({ createShipmentForInvoice: h.createShipmentForInvoice }));
vi.mock('@/lib/email/notifications', () => ({
  sendSellerStatementNotification: vi.fn(),
  sendPaymentConfirmation: h.sendPaymentConfirmation,
}));
vi.mock('@/lib/sellers/shadow', () => ({ isSentinelEmail: () => false }));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { processPaidInvoice } from '../service';

const loadedInvoice = {
  id: 'inv-1',
  lotId: 'lot-1',
  hammerPrice: 100_000,
  invoiceNumber: 'INV-1',
  totalAmount: 125_000,
  lot: { id: 'lot-1', sellerId: 'seller-1', consignmentId: null, title: 'Chair' },
  buyer: { email: 'buyer@example.com' },
};

function queueSelects() {
  h.selectResults.push(
    [], // settings
    [], // source upload item
    [], // fallback prospect rate
    [], // settings (commission)
    [{ id: 'ship-1' }], // shipment already exists
  );
}

afterEach(() => {
  h.selectResults.length = 0;
  vi.clearAllMocks();
});

describe('processPaidInvoice — payout failure', () => {
  it('strict: throws after the other steps ran (buyer receipt still sent)', async () => {
    h.findInvoice.mockResolvedValue(loadedInvoice);
    queueSelects();

    await expect(processPaidInvoice('inv-1', { sendBuyerConfirmation: true, strict: true })).rejects.toThrow('payout insert failed');
    expect(h.sendPaymentConfirmation).toHaveBeenCalledTimes(1);
  });

  it('non-strict: returns the failure for the admin instead of throwing', async () => {
    h.findInvoice.mockResolvedValue(loadedInvoice);
    queueSelects();

    const result = await processPaidInvoice('inv-1', { sendBuyerConfirmation: true });

    expect(result.payoutError).toBe('payout insert failed');
    expect(h.sendPaymentConfirmation).toHaveBeenCalledTimes(1);
  });

  it('strict: a failure to load the invoice also throws (so the webhook retries)', async () => {
    h.findInvoice.mockRejectedValue(new Error('connection reset'));

    await expect(processPaidInvoice('inv-1', { strict: true })).rejects.toThrow('connection reset');
  });
});
