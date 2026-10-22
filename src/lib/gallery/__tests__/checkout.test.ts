import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Buy Now checkout: one hold per piece, priced only from the server, one
 * Stripe session per hold, and a hold released at once if Stripe refuses.
 * The DB is a recording stub; Stripe and the hold release are mocks.
 */

const h = vi.hoisted(() => {
  const lotRows: unknown[][] = [];
  // The buyer's hold counts (live holds, holds on this piece today).
  const usage = { live: 0, onThisPiece: 0 };
  const inserted: Record<string, unknown>[] = [];
  const updates: Record<string, unknown>[] = [];
  function chain(result: () => unknown) {
    const c: Record<string, unknown> = {};
    const self = () => c;
    for (const m of ['from', 'where', 'limit']) c[m] = self;
    c.for = () => Promise.resolve(result());
    c.set = (v: Record<string, unknown>) => { updates.push(v); return c; };
    c.values = (v: Record<string, unknown>) => { inserted.push(v); return c; };
    c.returning = () => Promise.resolve([{ id: 'inv-new', accessToken: 'tok-new', stripeCheckoutSessionId: null, ...inserted[inserted.length - 1] }]);
    c.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(result()).then(res, rej);
    return c;
  }
  const tx = {
    // `.for('update')` is the lot lock; awaited directly it is the usage count.
    select: () => {
      const c = chain(() => [{ ...usage }]);
      c.for = () => Promise.resolve(lotRows.shift() ?? []);
      return c;
    },
    insert: () => chain(() => []),
  };
  const table = () => new Proxy({}, { get: (_t, k) => (typeof k === 'string' ? k : undefined) });
  return {
    lotRows,
    usage,
    inserted,
    updates,
    table,
    db: {
      transaction: async (fn: (t: typeof tx) => unknown) => fn(tx),
      update: () => chain(() => []),
    },
    stripe: { checkout: { sessions: { create: vi.fn(), retrieve: vi.fn() } } },
    configured: { value: true },
    findLiveInvoiceForLot: vi.fn(),
    releaseGalleryHold: vi.fn(),
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  };
});

vi.mock('@/db', () => ({ db: h.db }));
vi.mock('@/db/schema', () => ({ invoices: h.table(), lots: h.table() }));
vi.mock('@/lib/stripe/config', () => ({ stripe: h.stripe, isStripeConfigured: () => h.configured.value }));
vi.mock('@/lib/invoicing/generate-invoice', () => ({
  findLiveInvoiceForLot: h.findLiveInvoiceForLot,
  generateInvoiceNumber: () => 'INV-TEST',
}));
vi.mock('@/lib/gallery/holds', () => ({ releaseGalleryHold: h.releaseGalleryHold }));
vi.mock('@/lib/logger', () => ({ logger: h.logger }));

import { startGalleryCheckout } from '../checkout';

const buyer = { id: 'buyer-1', email: 'collector@example.com', stripeCustomerId: null };

function lot(overrides: Record<string, unknown> = {}) {
  return {
    id: 'lot-1',
    slug: 'georgian-silver-tea-urn',
    title: 'Georgian Silver Tea Urn',
    artist: null,
    maker: 'Paul Storr',
    primaryImageUrl: '/images/lots/urn.webp',
    saleType: 'gallery',
    status: 'for_sale',
    buyNowPrice: 450_000,
    shippingPrice: 7_500,
    onlineCheckout: true,
    sellerId: 'seller-1',
    ...overrides,
  };
}

function liveHold(overrides: Record<string, unknown> = {}) {
  return {
    id: 'inv-old',
    status: 'pending',
    buyerId: 'buyer-1',
    lotId: 'lot-1',
    accessToken: 'tok-old',
    hammerPrice: 450_000,
    shippingCost: 7_500,
    holdExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
    stripeCheckoutSessionId: 'cs_old',
    ...overrides,
  };
}

beforeEach(() => {
  h.configured.value = true;
  delete process.env.STRIPE_TAX;
  h.findLiveInvoiceForLot.mockResolvedValue(undefined);
  h.stripe.checkout.sessions.create.mockResolvedValue({ id: 'cs_new', url: 'https://checkout.stripe.com/c/new' });
  h.releaseGalleryHold.mockResolvedValue('released');
});

afterEach(() => {
  vi.clearAllMocks();
  h.usage.live = 0;
  h.usage.onThisPiece = 0;
  h.lotRows.length = 0;
  h.inserted.length = 0;
  h.updates.length = 0;
});

describe('a new Buy Now checkout', () => {
  it('holds the piece at the server’s price and opens one session that expires with the hold', async () => {
    h.lotRows.push([lot()]);
    const before = Date.now();
    const result = await startGalleryCheckout('lot-1', buyer);
    expect(result).toEqual({ ok: true, url: 'https://checkout.stripe.com/c/new' });

    const hold = h.inserted[0];
    expect(hold).toMatchObject({
      source: 'gallery',
      buyerId: 'buyer-1',
      lotId: 'lot-1',
      hammerPrice: 450_000,
      buyerPremium: 0,
      shippingCost: 7_500,
      taxAmount: 0,
      totalAmount: 457_500,
    });
    const holdEnds = (hold.holdExpiresAt as Date).getTime();
    expect(holdEnds % 1000).toBe(0);
    expect(holdEnds - before).toBeGreaterThan(31 * 60 * 1000);
    expect(holdEnds - before).toBeLessThanOrEqual(32 * 60 * 1000);
    expect(hold.dueDate).toEqual(hold.holdExpiresAt);

    const [params, opts] = h.stripe.checkout.sessions.create.mock.calls[0];
    expect(opts).toEqual({ idempotencyKey: 'gallery-checkout:inv-new' });
    expect(params.expires_at).toBe(holdEnds / 1000);
    expect(params.line_items[0].price_data.unit_amount).toBe(450_000);
    expect(params.line_items[0].price_data.product_data.images).toEqual([expect.stringMatching(/^https:\/\/.+\/images\/lots\/urn\.webp$/)]);
    expect(params.shipping_options[0].shipping_rate_data.fixed_amount).toEqual({ amount: 7_500, currency: 'usd' });
    expect(params.shipping_address_collection.allowed_countries).toEqual(['US']);
    expect(params.automatic_tax).toEqual({ enabled: true });
    expect(params.payment_intent_data.metadata).toEqual({ invoiceId: 'inv-new', lotId: 'lot-1', source: 'gallery' });
    expect(params.customer_email).toBe('collector@example.com');
    expect(params.success_url).toContain('/invoices/tok-new?paid=1');
    expect(h.updates).toContainEqual(expect.objectContaining({ stripeCheckoutSessionId: 'cs_new' }));
  });

  it('labels free shipping as complimentary and skips tax when STRIPE_TAX=off', async () => {
    process.env.STRIPE_TAX = 'off';
    h.lotRows.push([lot({ shippingPrice: 0 })]);
    await startGalleryCheckout('lot-1', buyer);
    const [params] = h.stripe.checkout.sessions.create.mock.calls[0];
    expect(params.automatic_tax).toEqual({ enabled: false });
    expect(params.line_items[0].price_data.tax_behavior).toBeUndefined();
    expect(params.shipping_options[0].shipping_rate_data.display_name).toBe('Complimentary insured shipping');
    expect(h.inserted[0].totalAmount).toBe(450_000);
  });

  it('saves the checkout address onto an existing Stripe customer so Stripe Tax can use it', async () => {
    h.lotRows.push([lot()]);
    await startGalleryCheckout('lot-1', { ...buyer, stripeCustomerId: 'cus_1' });
    const [params] = h.stripe.checkout.sessions.create.mock.calls[0];
    expect(params.customer).toBe('cus_1');
    expect(params.customer_email).toBeUndefined();
    expect(params.customer_update).toEqual({ address: 'auto', shipping: 'auto' });
  });

  it('releases the hold straight away when Stripe refuses the session', async () => {
    h.lotRows.push([lot()]);
    h.stripe.checkout.sessions.create.mockRejectedValue(new Error('Stripe Tax has not been activated'));
    const result = await startGalleryCheckout('lot-1', buyer);
    expect(result).toMatchObject({ ok: false, code: 'UNAVAILABLE', status: 503 });
    expect(h.releaseGalleryHold).toHaveBeenCalledWith(expect.objectContaining({ id: 'inv-new' }), expect.stringContaining('could not start'), { force: true });
    expect(h.logger.error).toHaveBeenCalledWith(expect.stringContaining('Stripe Tax'), expect.anything(), expect.anything());
  });
});

describe('when the piece is spoken for or not for sale online', () => {
  it('refuses while another buyer’s hold is live, and says when it lapses', async () => {
    h.lotRows.push([lot()]);
    const other = liveHold({ buyerId: 'buyer-2' });
    h.findLiveInvoiceForLot.mockResolvedValue(other);
    const result = await startGalleryCheckout('lot-1', buyer);
    expect(result).toMatchObject({ ok: false, code: 'ON_HOLD', status: 409, holdExpiresAt: other.holdExpiresAt.toISOString() });
    expect(h.inserted).toHaveLength(0);
    expect(h.stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it('points a client at their own invoice, and tells everyone else it is reserved', async () => {
    h.lotRows.push([lot()], [lot()]);
    h.findLiveInvoiceForLot.mockResolvedValue(liveHold({ holdExpiresAt: null, accessToken: 'tok-staff' }));
    await expect(startGalleryCheckout('lot-1', buyer)).resolves.toMatchObject({ code: 'INVOICED', invoiceToken: 'tok-staff' });
    const other = await startGalleryCheckout('lot-1', { ...buyer, id: 'buyer-2' });
    expect(other).toMatchObject({ code: 'RESERVED' });
    expect(JSON.stringify(other)).not.toContain('tok-staff');
  });

  it('refuses a piece that is not switched on for online checkout, sold, or the buyer’s own consignment', async () => {
    h.lotRows.push([lot({ onlineCheckout: false })], [lot({ status: 'sold' })], [lot({ sellerId: 'buyer-1' })], []);
    await expect(startGalleryCheckout('lot-1', buyer)).resolves.toMatchObject({ code: 'NOT_AVAILABLE' });
    await expect(startGalleryCheckout('lot-1', buyer)).resolves.toMatchObject({ code: 'SOLD' });
    await expect(startGalleryCheckout('lot-1', buyer)).resolves.toMatchObject({ code: 'OWN_LOT' });
    await expect(startGalleryCheckout('lot-1', buyer)).resolves.toMatchObject({ code: 'NOT_FOUND', status: 404 });
    expect(h.inserted).toHaveLength(0);
  });

  it('caps how many pieces a buyer can hold, and how often they can re-hold one piece', async () => {
    h.lotRows.push([lot()], [lot()]);
    h.usage.live = 3;
    await expect(startGalleryCheckout('lot-1', buyer)).resolves.toMatchObject({ code: 'TOO_MANY_HOLDS', status: 429 });
    h.usage.live = 0;
    h.usage.onThisPiece = 3;
    await expect(startGalleryCheckout('lot-1', buyer)).resolves.toMatchObject({ code: 'TOO_MANY_HOLDS' });
    expect(h.inserted).toHaveLength(0);
  });

  it('touches nothing when Stripe is not configured', async () => {
    h.configured.value = false;
    await expect(startGalleryCheckout('lot-1', buyer)).resolves.toMatchObject({ code: 'UNAVAILABLE' });
    expect(h.findLiveInvoiceForLot).not.toHaveBeenCalled();
  });
});

describe('coming back to a checkout', () => {
  it('returns the buyer to their open session instead of making a second one', async () => {
    h.lotRows.push([lot()]);
    h.findLiveInvoiceForLot.mockResolvedValue(liveHold());
    h.stripe.checkout.sessions.retrieve.mockResolvedValue({ status: 'open', url: 'https://checkout.stripe.com/c/old', payment_intent: null });
    await expect(startGalleryCheckout('lot-1', buyer)).resolves.toEqual({ ok: true, url: 'https://checkout.stripe.com/c/old' });
    expect(h.stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it('says the payment is processing rather than opening a second checkout', async () => {
    h.lotRows.push([lot()]);
    h.findLiveInvoiceForLot.mockResolvedValue(liveHold());
    h.stripe.checkout.sessions.retrieve.mockResolvedValue({ status: 'complete', payment_status: 'paid', url: null, payment_intent: { status: 'succeeded' } });
    await expect(startGalleryCheckout('lot-1', buyer)).resolves.toMatchObject({ code: 'PROCESSING' });
    expect(h.stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it('releases a lapsed hold (anyone’s) and starts a fresh one', async () => {
    h.lotRows.push([lot()], [lot()]);
    h.findLiveInvoiceForLot
      .mockResolvedValueOnce(liveHold({ buyerId: 'buyer-2', holdExpiresAt: new Date(Date.now() - 60_000) }))
      .mockResolvedValueOnce(undefined);
    const result = await startGalleryCheckout('lot-1', buyer);
    expect(h.releaseGalleryHold).toHaveBeenCalledWith(expect.objectContaining({ id: 'inv-old' }), expect.any(String), expect.anything());
    expect(result).toEqual({ ok: true, url: 'https://checkout.stripe.com/c/new' });
    expect(h.inserted).toHaveLength(1);
  });

  it('asks the buyer to retry while Stripe has not confirmed the old checkout closed', async () => {
    h.lotRows.push([lot()]);
    h.findLiveInvoiceForLot.mockResolvedValue(liveHold({ holdExpiresAt: new Date(Date.now() - 60_000) }));
    h.releaseGalleryHold.mockResolvedValue('unknown');
    const result = await startGalleryCheckout('lot-1', buyer);
    expect(result).toMatchObject({ code: 'ON_HOLD' });
    expect(!result.ok && result.error).toMatch(/still closing/);
  });

  it('keeps a lapsed hold that Stripe says was paid', async () => {
    h.lotRows.push([lot()]);
    h.findLiveInvoiceForLot.mockResolvedValue(liveHold({ buyerId: 'buyer-2', holdExpiresAt: new Date(Date.now() - 60_000) }));
    h.releaseGalleryHold.mockResolvedValue('paying');
    await expect(startGalleryCheckout('lot-1', buyer)).resolves.toMatchObject({ code: 'RESERVED' });
    expect(h.inserted).toHaveLength(0);
  });
});
