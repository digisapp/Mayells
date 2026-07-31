import { describe, it, expect } from 'vitest';
import { isValidPortalToken, consignorStatusLabel, summarizeConsignor } from '../portal';

describe('isValidPortalToken', () => {
  it('accepts a uuid', () => {
    expect(isValidPortalToken('a3f1c2e4-5b6d-4a7e-8f90-123456789abc')).toBe(true);
  });

  it('rejects non-uuid tokens (must 404, not throw in postgres)', () => {
    expect(isValidPortalToken('')).toBe(false);
    expect(isValidPortalToken('not-a-uuid')).toBe(false);
    expect(isValidPortalToken("'; DROP TABLE users; --")).toBe(false);
    expect(isValidPortalToken('a3f1c2e4-5b6d-4a7e-8f90-123456789ab')).toBe(false);
  });
});

describe('consignorStatusLabel', () => {
  it('groups pre-sale statuses as In preparation', () => {
    expect(consignorStatusLabel('draft')).toBe('In preparation');
    expect(consignorStatusLabel('pending_review')).toBe('In preparation');
    expect(consignorStatusLabel('approved')).toBe('In preparation');
  });

  it('labels sale states', () => {
    expect(consignorStatusLabel('for_sale')).toBe('For sale in gallery');
    expect(consignorStatusLabel('in_auction')).toBe('In auction');
    expect(consignorStatusLabel('sold')).toBe('Sold');
    expect(consignorStatusLabel('withdrawn')).toBe('Withdrawn');
  });

  it('never leaks an internal status string for unknown values', () => {
    expect(consignorStatusLabel('some_future_status')).toBe('In preparation');
  });
});

describe('summarizeConsignor', () => {
  it('computes counts and payout totals', () => {
    const summary = summarizeConsignor(
      [{ status: 'sold' }, { status: 'sold' }, { status: 'in_auction' }, { status: 'approved' }],
      [
        { status: 'paid', netAmount: 100_000 },
        { status: 'paid', netAmount: 50_000 },
        { status: 'pending', netAmount: 75_000 },
      ],
    );
    expect(summary).toEqual({ totalItems: 4, soldItems: 2, paidNet: 150_000, pendingNet: 75_000 });
  });

  it('ignores cancelled payouts and handles empty input', () => {
    expect(summarizeConsignor([], [{ status: 'cancelled', netAmount: 999 }])).toEqual({
      totalItems: 0,
      soldItems: 0,
      paidNet: 0,
      pendingNet: 0,
    });
  });
});
