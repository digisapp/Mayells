import { describe, it, expect } from 'vitest';
import {
  decideLaResult,
  laResultSchema,
  laSaleRefusal,
  parseHammerDollars,
} from '../la-results';

const LOT_ID = '6f1c2a4e-8b1d-4c3e-9f2a-1b2c3d4e5f60';
const LA_URL = 'https://www.liveauctioneers.com/catalog/123';

describe('laResultSchema', () => {
  it('needs a positive whole-cent hammer price for a sale', () => {
    expect(laResultSchema.safeParse({ lotId: LOT_ID, outcome: 'sold', hammerPrice: 125000 }).success).toBe(true);
    expect(laResultSchema.safeParse({ lotId: LOT_ID, outcome: 'sold' }).success).toBe(false);
    expect(laResultSchema.safeParse({ lotId: LOT_ID, outcome: 'sold', hammerPrice: 0 }).success).toBe(false);
    expect(laResultSchema.safeParse({ lotId: LOT_ID, outcome: 'sold', hammerPrice: 12.5 }).success).toBe(false);
    expect(laResultSchema.safeParse({ lotId: LOT_ID, outcome: 'sold', hammerPrice: 3_000_000_000 }).success).toBe(false);
  });

  it('takes relist and return without a price, and rejects anything else', () => {
    expect(laResultSchema.safeParse({ lotId: LOT_ID, outcome: 'relist' }).success).toBe(true);
    expect(laResultSchema.safeParse({ lotId: LOT_ID, outcome: 'return' }).success).toBe(true);
    expect(laResultSchema.safeParse({ lotId: LOT_ID, outcome: 'withdraw' }).success).toBe(false);
    expect(laResultSchema.safeParse({ lotId: 'lot-1', outcome: 'return' }).success).toBe(false);
  });
});

describe('laSaleRefusal', () => {
  it('accepts results for a LiveAuctioneers sale once bidding has started', () => {
    for (const status of ['open', 'live', 'closing', 'closed']) {
      expect(laSaleRefusal({ status, liveauctioneersUrl: LA_URL })).toBeNull();
    }
  });

  it('refuses a sale bid on mayells.com', () => {
    expect(laSaleRefusal({ status: 'closed', liveauctioneersUrl: null })).toMatch(/mayells\.com/);
    expect(laSaleRefusal({ status: 'closed', liveauctioneersUrl: '  ' })).toMatch(/mayells\.com/);
  });

  it('refuses before bidding opens and after the sale is finished', () => {
    for (const status of ['draft', 'scheduled', 'preview']) {
      expect(laSaleRefusal({ status, liveauctioneersUrl: LA_URL })).toMatch(/once bidding has opened/);
    }
    expect(laSaleRefusal({ status: 'completed', liveauctioneersUrl: LA_URL })).toMatch(/completed/);
    expect(laSaleRefusal({ status: 'cancelled', liveauctioneersUrl: LA_URL })).toMatch(/cancelled/);
  });
});

describe('decideLaResult', () => {
  const lot = (status: string, extra: Partial<{ hammerPrice: number | null; reservePrice: number | null; estimateLow: number | null }> = {}) => ({
    status,
    hammerPrice: null,
    reservePrice: null,
    estimateLow: null,
    ...extra,
  });

  it('applies any result to a lot still awaiting one', () => {
    expect(decideLaResult(lot('approved'), { outcome: 'sold', hammerPrice: 500 })).toEqual({ kind: 'apply' });
    expect(decideLaResult(lot('in_auction'), { outcome: 'return' })).toEqual({ kind: 'apply' });
  });

  it('treats the same result twice as already recorded', () => {
    expect(decideLaResult(lot('sold', { hammerPrice: 500 }), { outcome: 'sold', hammerPrice: 500 })).toEqual({ kind: 'already' });
    expect(decideLaResult(lot('for_sale'), { outcome: 'relist' })).toEqual({ kind: 'already' });
    expect(decideLaResult(lot('unsold'), { outcome: 'return' })).toEqual({ kind: 'already' });
    // A relist with nothing to price it at was recorded as a return.
    expect(decideLaResult(lot('unsold'), { outcome: 'relist' })).toEqual({ kind: 'already' });
  });

  it('lets a sold lot\'s hammer price be corrected', () => {
    expect(decideLaResult({ ...lot('sold', { hammerPrice: 500 }), saleType: 'auction', winnerId: null }, { outcome: 'sold', hammerPrice: 600 })).toEqual({ kind: 'correct' });
  });

  it('refuses to correct a lot sold later on mayells.com', () => {
    // Relisted from the sale, then bought in the gallery.
    expect(decideLaResult({ ...lot('sold'), saleType: 'gallery', winnerId: null }, { outcome: 'sold', hammerPrice: 600 })).toMatchObject({ kind: 'refuse' });
    // Won in a later on-site sale.
    expect(decideLaResult({ ...lot('sold', { hammerPrice: 500 }), saleType: 'auction', winnerId: 'u1' }, { outcome: 'sold', hammerPrice: 600 })).toMatchObject({ kind: 'refuse' });
  });

  it('refuses a different result for a lot that already has one', () => {
    expect(decideLaResult(lot('for_sale'), { outcome: 'sold', hammerPrice: 500 })).toMatchObject({ kind: 'refuse' });
    expect(decideLaResult(lot('unsold', { reservePrice: 1000 }), { outcome: 'relist' })).toMatchObject({ kind: 'refuse' });
    expect(decideLaResult(lot('sold', { hammerPrice: 500 }), { outcome: 'return' })).toMatchObject({ kind: 'refuse' });
  });

  it('refuses lots that were never offered', () => {
    expect(decideLaResult(lot('withdrawn'), { outcome: 'return' })).toMatchObject({ kind: 'refuse', error: expect.stringMatching(/withdrawn/) });
    expect(decideLaResult(lot('pending_review'), { outcome: 'sold', hammerPrice: 500 })).toMatchObject({
      kind: 'refuse',
      error: expect.stringMatching(/pending review/),
    });
  });
});

describe('parseHammerDollars', () => {
  it('reads dollars as typed by an admin', () => {
    expect(parseHammerDollars('1250')).toBe(125000);
    expect(parseHammerDollars('$1,250')).toBe(125000);
    expect(parseHammerDollars(' 1,250.5 ')).toBe(125050);
    expect(parseHammerDollars('0.99')).toBe(99);
  });

  it('rejects empty, zero, negative, malformed and oversized amounts', () => {
    for (const raw of ['', '0', '0.00', '-5', 'abc', '12.345', '1.2.3', '30000000']) {
      expect(parseHammerDollars(raw)).toBeNull();
    }
  });
});
