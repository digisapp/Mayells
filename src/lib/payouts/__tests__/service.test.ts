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
    sendGalleryOrderConfirmation: vi.fn(),
    sendGallerySaleAdminNotification: vi.fn(),
    markGalleryLotSold: vi.fn(),
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
  sendGalleryOrderConfirmation: h.sendGalleryOrderConfirmation,
  sendGallerySaleAdminNotification: h.sendGallerySaleAdminNotification,
}));
vi.mock('@/lib/gallery/settle', () => ({ markGalleryLotSold: h.markGalleryLotSold }));
vi.mock('@/lib/sellers/shadow', () => ({ isSentinelEmail: () => false }));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { processPaidInvoice } from '../service';

const loadedInvoice = {
  id: 'inv-1',
  status: 'paid',
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

describe('processPaidInvoice — a gallery sale', () => {
  const galleryInvoice = {
    ...loadedInvoice,
    source: 'gallery',
    holdExpiresAt: new Date('2026-10-22T15:32:00Z'),
    accessToken: 'tok-1',
    shippingCost: 7_500,
    taxAmount: 7_000,
    totalAmount: 114_500,
    shippingAddress: JSON.stringify({ name: 'A Collector', line1: '1 Worth Ave', city: 'Palm Beach', state: 'FL', postalCode: '33480', country: 'US' }),
    buyer: { email: 'buyer@example.com', fullName: 'A Collector' },
  };

  it('marks the piece sold, sends the order confirmation and alerts staff', async () => {
    h.findInvoice.mockResolvedValue(galleryInvoice);
    h.markGalleryLotSold.mockResolvedValue('sold');
    queueSelects();

    await processPaidInvoice('inv-1', { sendBuyerConfirmation: true });

    expect(h.markGalleryLotSold).toHaveBeenCalledWith(galleryInvoice);
    expect(h.sendPaymentConfirmation).not.toHaveBeenCalled();
    expect(h.sendGalleryOrderConfirmation).toHaveBeenCalledWith(expect.objectContaining({
      price: 100_000,
      shippingCost: 7_500,
      taxAmount: 7_000,
      totalAmount: 114_500,
      accessToken: 'tok-1',
      shipTo: ['A Collector', '1 Worth Ave', 'Palm Beach, FL 33480'],
      guaranteeDays: 7,
    }));
    expect(h.sendGallerySaleAdminNotification).toHaveBeenCalledWith(expect.objectContaining({ online: true, hasSeller: true }));
  });

  it('on a webhook redelivery (no confirmation) re-marks the piece sold but emails nobody', async () => {
    h.findInvoice.mockResolvedValue(galleryInvoice);
    h.markGalleryLotSold.mockResolvedValue('sold');
    queueSelects();

    await processPaidInvoice('inv-1');

    expect(h.markGalleryLotSold).toHaveBeenCalledTimes(1);
    expect(h.sendGalleryOrderConfirmation).not.toHaveBeenCalled();
    expect(h.sendGallerySaleAdminNotification).not.toHaveBeenCalled();
  });

  it('strict: a failure to mark the piece sold is thrown so Stripe redelivers', async () => {
    h.findInvoice.mockResolvedValue(galleryInvoice);
    h.markGalleryLotSold.mockRejectedValue(new Error('lot update failed'));
    queueSelects();

    await expect(processPaidInvoice('inv-1', { strict: true })).rejects.toThrow(/lot update failed|payout insert failed/);
  });
});

describe('processPaidInvoice — an invoice that is no longer paid', () => {
  it('settles nothing (a stale redelivery racing a refund)', async () => {
    h.findInvoice.mockResolvedValue({ ...loadedInvoice, source: 'gallery', status: 'refunded' });

    await expect(processPaidInvoice('inv-1', { sendBuyerConfirmation: true, strict: true })).resolves.toEqual({ payoutError: null });
    expect(h.markGalleryLotSold).not.toHaveBeenCalled();
    expect(h.sendGalleryOrderConfirmation).not.toHaveBeenCalled();
    expect(h.createShipmentForInvoice).not.toHaveBeenCalled();
  });
});
