import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Unwinding a refunded sale must not put an item back on sale when it has
 * already left the seller (shipment in transit, delivered or in exception):
 * the lot is held `unsold` and the invoice flagged instead. The DB is a
 * recording stub; relist / payout helpers are mocked.
 */

const h = vi.hoisted(() => {
  const selectResults: unknown[][] = [];
  const returningResults: unknown[][] = [];
  const sets: Record<string, unknown>[] = [];
  function chain(kind: 'select' | 'update') {
    const c: Record<string, unknown> = {};
    const self = () => c;
    for (const m of ['from', 'where', 'limit', 'innerJoin', 'for']) c[m] = self;
    c.set = (v: Record<string, unknown>) => { sets.push(v); return c; };
    c.returning = () => Promise.resolve(returningResults.shift() ?? []);
    c.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
      Promise.resolve(kind === 'select' ? selectResults.shift() ?? [] : []).then(res, rej);
    return c;
  }
  const tx = { select: () => chain('select'), update: () => chain('update') };
  const table = () => new Proxy({}, { get: (_t, k) => (typeof k === 'string' ? k : undefined) });
  return {
    selectResults,
    returningResults,
    sets,
    table,
    db: { ...tx, transaction: async (fn: (t: typeof tx) => unknown) => fn(tx) },
    relistUnsoldLot: vi.fn(),
    relistDirectSaleLot: vi.fn(),
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  };
});

vi.mock('@/db', () => ({ db: h.db }));
vi.mock('@/db/schema', () => ({
  invoices: h.table(),
  lots: h.table(),
  shipments: h.table(),
  auctions: h.table(),
  users: h.table(),
  consignments: h.table(),
}));
vi.mock('@/lib/lots/relist', () => ({ relistUnsoldLot: h.relistUnsoldLot, relistDirectSaleLot: h.relistDirectSaleLot }));
vi.mock('@/lib/payouts/service', () => ({ cancelPayoutForRefundedInvoice: vi.fn(async () => 'cancelled') }));
vi.mock('@/lib/stripe/config', () => ({ stripe: { checkout: { sessions: { expire: vi.fn() } } } }));
vi.mock('@/lib/email/notifications', () => ({ sendInvoiceRefundedNotification: vi.fn() }));
vi.mock('@/lib/revalidate', () => ({ revalidatePublicCatalog: vi.fn() }));
vi.mock('@/lib/logger', () => ({ logger: h.logger }));

import { unwindPaidInvoice, cancelPendingInvoice } from '../unwind';

const refundedInvoice = {
  id: 'inv-1',
  lotId: 'lot-1',
  buyerId: 'buyer-1',
  auctionId: null,
  invoiceNumber: 'INV-1',
  totalAmount: 100_000,
  stripeCheckoutSessionId: null,
};
const soldLot = { id: 'lot-1', status: 'sold', winnerId: 'buyer-1', reservePrice: 50_000, estimateLow: 40_000 };

afterEach(() => {
  h.selectResults.length = 0;
  h.returningResults.length = 0;
  h.sets.length = 0;
  vi.clearAllMocks();
});

describe('unwindPaidInvoice — releasing the lot', () => {
  it('relists the lot when nothing has shipped', async () => {
    h.returningResults.push([refundedInvoice]);
    h.selectResults.push([], [soldLot]); // no shipment gone, the locked lot
    h.relistUnsoldLot.mockResolvedValue('relisted');

    const result = await unwindPaidInvoice('inv-1', 'test', { notifyBuyer: false });

    expect(result.lot).toBe('relisted');
    expect(h.relistUnsoldLot).toHaveBeenCalledTimes(1);
    expect(h.logger.error).not.toHaveBeenCalled();
  });

  it.each(['in_transit', 'delivered', 'exception'])('holds the lot unsold (not relisted) when the shipment is %s', async (status) => {
    h.returningResults.push([refundedInvoice]);
    h.selectResults.push([{ id: 'ship-1', status }], [soldLot]);

    const result = await unwindPaidInvoice('inv-1', 'test', { notifyBuyer: false });

    expect(result.lot).toBe('held');
    expect(h.relistUnsoldLot).not.toHaveBeenCalled();
    expect(h.sets).toContainEqual(expect.objectContaining({ status: 'unsold', winnerId: null }));
    // The ATTENTION note on the invoice (a notes-only update).
    expect(h.sets.some((s) => 'notes' in s && !('status' in s))).toBe(true);
    expect(h.logger.error).toHaveBeenCalledWith(expect.stringContaining('lot held as unsold'), undefined, expect.anything());
  });

  it('takes a held lot\'s consignment off "sold"', async () => {
    h.returningResults.push([refundedInvoice]);
    h.selectResults.push([{ id: 'ship-1', status: 'delivered' }], [{ ...soldLot, consignmentId: 'con-1' }]);

    const result = await unwindPaidInvoice('inv-1', 'test', { notifyBuyer: false });

    expect(result.lot).toBe('held');
    expect(h.sets).toContainEqual(expect.objectContaining({ status: 'approved' }));
  });
});

describe('cancelPendingInvoice — a gallery invoice', () => {
  it('only voids the reservation: the piece was never taken off sale', async () => {
    h.returningResults.push([{ ...refundedInvoice, source: 'gallery', status: 'cancelled' }]);
    h.selectResults.push([{ id: 'lot-1', status: 'for_sale', winnerId: null, saleType: 'gallery', buyNowPrice: 450_000 }]);

    const result = await cancelPendingInvoice('inv-1', 'client backed out');

    expect(result).toEqual({ cancelled: true, status: 'cancelled', lot: 'relisted' });
    expect(h.relistUnsoldLot).not.toHaveBeenCalled();
    expect(h.logger.warn).not.toHaveBeenCalled();
  });
});

describe('unwindPaidInvoice — a refunded gallery or private sale', () => {
  it('puts the piece back on sale as listed instead of re-pricing it from its reserve', async () => {
    h.returningResults.push([{ ...refundedInvoice, source: 'gallery' }]);
    h.selectResults.push([], [{ ...soldLot, saleType: 'private', buyNowPrice: null }]);
    h.relistDirectSaleLot.mockResolvedValue('relisted');

    const result = await unwindPaidInvoice('inv-1', 'test', { notifyBuyer: false });

    expect(result.lot).toBe('relisted');
    expect(h.relistDirectSaleLot).toHaveBeenCalledTimes(1);
    expect(h.relistUnsoldLot).not.toHaveBeenCalled();
  });
});
