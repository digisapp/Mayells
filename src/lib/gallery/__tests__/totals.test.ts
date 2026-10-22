import { describe, expect, it } from 'vitest';
import { galleryTotalsFromSession, type CheckoutSessionAmounts } from '../totals';

const hold = { hammerPrice: 450_000, shippingCost: 7_500, totalAmount: 457_500 };

function session(overrides: Partial<CheckoutSessionAmounts> & { tax?: number; shipping?: number | null; discount?: number } = {}): CheckoutSessionAmounts {
  const tax = overrides.tax ?? 32_025;
  const shipping = overrides.shipping === undefined ? 7_500 : overrides.shipping;
  const subtotal = overrides.amount_subtotal ?? 450_000;
  return {
    currency: overrides.currency ?? 'usd',
    amount_subtotal: subtotal,
    amount_total: overrides.amount_total ?? subtotal + (shipping ?? 0) + tax - (overrides.discount ?? 0),
    total_details: overrides.total_details === undefined
      ? { amount_discount: overrides.discount ?? 0, amount_shipping: shipping, amount_tax: tax }
      : overrides.total_details,
  };
}

describe('galleryTotalsFromSession', () => {
  it('takes Stripe’s tax and total when the price and shipping match the hold', () => {
    expect(galleryTotalsFromSession(hold, session())).toEqual({
      ok: true,
      shippingCost: 7_500,
      taxAmount: 32_025,
      totalAmount: 489_525,
    });
  });

  it('accepts a tax-free sale (out of state, or Stripe Tax off)', () => {
    expect(galleryTotalsFromSession(hold, session({ tax: 0 }))).toEqual({
      ok: true,
      shippingCost: 7_500,
      taxAmount: 0,
      totalAmount: 457_500,
    });
  });

  it('handles complimentary shipping (no shipping amount on the session)', () => {
    const free = { hammerPrice: 450_000, shippingCost: 0, totalAmount: 450_000 };
    expect(galleryTotalsFromSession(free, session({ shipping: null, tax: 0 }))).toMatchObject({ ok: true, shippingCost: 0, totalAmount: 450_000 });
  });

  it('refuses when anything we set differs from what Stripe charged', () => {
    expect(galleryTotalsFromSession(hold, session({ amount_subtotal: 400_000 })).ok).toBe(false);
    expect(galleryTotalsFromSession(hold, session({ shipping: 5_000 })).ok).toBe(false);
    expect(galleryTotalsFromSession(hold, session({ discount: 1_000 })).ok).toBe(false);
    expect(galleryTotalsFromSession(hold, session({ currency: 'eur' })).ok).toBe(false);
    expect(galleryTotalsFromSession(hold, session({ amount_total: 1 })).ok).toBe(false);
    expect(galleryTotalsFromSession(hold, session({ total_details: null })).ok).toBe(false);
  });
});
