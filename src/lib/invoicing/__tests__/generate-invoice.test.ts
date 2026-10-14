import { describe, it, expect, vi } from 'vitest';

vi.mock('@/db', () => ({ db: {} }));

import { generateInvoiceForWonLot, computeBuyerPremium } from '../generate-invoice';

const AUCTION = 'a0000000-0000-4000-8000-000000000001';
const OTHER_AUCTION = 'a0000000-0000-4000-8000-000000000002';
const LOT = 'b0000000-0000-4000-8000-000000000001';
const BUYER = 'c0000000-0000-4000-8000-000000000001';
const OTHER_BUYER = 'c0000000-0000-4000-8000-000000000002';

/**
 * A stand-in for the db/transaction: each select resolves to the next queued
 * result set; inserts resolve to the inserted row.
 */
function fakeExecutor(selects: unknown[][]) {
  const queue = [...selects];
  const inserted: unknown[] = [];
  const chain = (rows: unknown[]) => {
    const c = {
      from: () => c,
      where: () => c,
      limit: () => Promise.resolve(rows),
      then: (resolve: (v: unknown[]) => unknown) => Promise.resolve(rows).then(resolve),
    };
    return c;
  };
  const executor = {
    select: () => chain(queue.shift() ?? []),
    insert: () => ({
      values: (v: Record<string, unknown>) => ({
        returning: () => {
          inserted.push(v);
          return Promise.resolve([{ id: 'new-invoice', ...v }]);
        },
      }),
    }),
  };
  return { executor: executor as never, inserted };
}

const params = { auctionId: AUCTION, lotId: LOT, buyerId: BUYER, hammerPrice: 100_000 };

describe('generateInvoiceForWonLot', () => {
  it('hands back the invoice a replay of this settlement already made', async () => {
    const existing = { id: 'inv-1', invoiceNumber: 'INV-1', auctionId: AUCTION, buyerId: BUYER, lotId: LOT };
    const { executor, inserted } = fakeExecutor([[existing]]);
    await expect(generateInvoiceForWonLot(params, executor)).resolves.toBe(existing);
    expect(inserted).toHaveLength(0);
  });

  it('refuses when the lot is already invoiced to another buyer', async () => {
    const existing = { id: 'inv-1', invoiceNumber: 'INV-1', auctionId: AUCTION, buyerId: OTHER_BUYER, lotId: LOT };
    const { executor, inserted } = fakeExecutor([[existing]]);
    await expect(generateInvoiceForWonLot(params, executor)).rejects.toThrow(/INV-1.*another sale or buyer/);
    expect(inserted).toHaveLength(0);
  });

  it('refuses when the lot is already invoiced from another sale or the gallery', async () => {
    for (const auctionId of [OTHER_AUCTION, null]) {
      const existing = { id: 'inv-1', invoiceNumber: 'INV-1', auctionId, buyerId: BUYER, lotId: LOT };
      const { executor } = fakeExecutor([[existing]]);
      await expect(generateInvoiceForWonLot(params, executor)).rejects.toThrow(/another sale or buyer/);
    }
  });

  it('creates the invoice with the sale premium when none exists', async () => {
    const { executor, inserted } = fakeExecutor([[], [{ id: AUCTION, buyerPremiumPercent: 25 }], [{ invoiceDueDays: 7 }]]);
    const invoice = await generateInvoiceForWonLot(params, executor);
    expect(inserted).toHaveLength(1);
    expect(invoice).toMatchObject({
      auctionId: AUCTION,
      buyerId: BUYER,
      lotId: LOT,
      hammerPrice: 100_000,
      buyerPremium: computeBuyerPremium(100_000, 25),
      totalAmount: 125_000,
    });
  });
});
