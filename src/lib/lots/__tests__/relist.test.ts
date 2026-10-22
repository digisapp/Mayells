import { describe, expect, it, vi } from 'vitest';

vi.mock('@/db', () => ({ db: {} }));
vi.mock('@/db/schema', () => ({ lots: {}, consignments: {} }));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn() } }));

import { relistPrice } from '../relist';

describe('relistPrice', () => {
  it('keeps a gallery piece at the price it was bought at when its sale is undone', () => {
    expect(relistPrice({ id: 'l', saleType: 'gallery', buyNowPrice: 450_000, reservePrice: 300_000, estimateLow: 350_000 })).toBe(450_000);
  });

  it('offers an unsold auction lot at its reserve, else its low estimate', () => {
    expect(relistPrice({ id: 'l', saleType: 'auction', buyNowPrice: 999, reservePrice: 300_000, estimateLow: 350_000 })).toBe(300_000);
    expect(relistPrice({ id: 'l', saleType: 'auction', reservePrice: null, estimateLow: 350_000 })).toBe(350_000);
    expect(relistPrice({ id: 'l', reservePrice: null, estimateLow: null })).toBeNull();
  });
});
