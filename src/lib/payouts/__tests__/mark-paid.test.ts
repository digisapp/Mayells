import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Marking consignor payouts paid: never while the buyer's chargeback is open
 * unless the admin explicitly overrides. The DB is a recording stub.
 */

const h = vi.hoisted(() => {
  const selectResults: unknown[][] = [];
  const returningResults: unknown[][] = [];
  function chain(kind: 'select' | 'update') {
    const c: Record<string, unknown> = {};
    const self = () => c;
    for (const m of ['from', 'where', 'limit', 'innerJoin', 'set']) c[m] = self;
    c.returning = () => Promise.resolve(returningResults.shift() ?? []);
    c.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
      Promise.resolve(kind === 'select' ? selectResults.shift() ?? [] : []).then(res, rej);
    return c;
  }
  const table = () => new Proxy({}, { get: (_t, k) => (typeof k === 'string' ? k : undefined) });
  return {
    selectResults,
    returningResults,
    table,
    db: { select: () => chain('select'), update: () => chain('update') },
    sendPayoutSentNotification: vi.fn(),
  };
});

vi.mock('@/db', () => ({ db: h.db }));
vi.mock('@/db/schema', () => ({ payouts: h.table(), invoices: h.table(), lots: h.table(), users: h.table() }));
vi.mock('@/lib/email/notifications', () => ({ sendPayoutSentNotification: h.sendPayoutSentNotification }));
vi.mock('@/lib/sellers/shadow', () => ({ isSentinelEmail: () => false }));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { markPayoutsPaid, DISPUTE_OPEN_REASON } from '../mark-paid';

const payout = { id: 'po-1', status: 'pending', sellerId: 'seller-1', netAmount: 80_000 };
const disputedRow = {
  payout,
  invoiceStatus: 'paid',
  invoiceDisputedAt: new Date('2026-10-01T12:00:00Z'),
  lotTitle: 'Chair',
};

afterEach(() => {
  h.selectResults.length = 0;
  h.returningResults.length = 0;
  vi.clearAllMocks();
});

describe('markPayoutsPaid — open buyer dispute', () => {
  it('refuses a payout whose buyer has an open dispute', async () => {
    h.selectResults.push([disputedRow]);

    const result = await markPayoutsPaid({ payoutIds: ['po-1'], method: 'wire', adminId: 'admin-1' });

    expect(result.paid).toHaveLength(0);
    expect(result.skipped).toEqual([{ payoutId: 'po-1', reason: DISPUTE_OPEN_REASON }]);
    expect(h.sendPayoutSentNotification).not.toHaveBeenCalled();
  });

  it('pays it when the admin explicitly overrides', async () => {
    h.selectResults.push([disputedRow], [{ email: 'seller@example.com', fullName: 'Sam', portalToken: 't' }]);
    h.returningResults.push([{ ...payout, status: 'paid' }]);

    const result = await markPayoutsPaid({ payoutIds: ['po-1'], method: 'wire', adminId: 'admin-1', allowDisputed: true });

    expect(result.paid).toHaveLength(1);
    expect(result.skipped).toHaveLength(0);
  });

  it('pays an undisputed payout as before', async () => {
    h.selectResults.push([{ ...disputedRow, invoiceDisputedAt: null }], [{ email: 'seller@example.com', fullName: 'Sam', portalToken: 't' }]);
    h.returningResults.push([{ ...payout, status: 'paid' }]);

    const result = await markPayoutsPaid({ payoutIds: ['po-1'], method: 'wire', adminId: 'admin-1' });

    expect(result.paid).toHaveLength(1);
    expect(h.sendPayoutSentNotification).toHaveBeenCalledTimes(1);
  });
});
