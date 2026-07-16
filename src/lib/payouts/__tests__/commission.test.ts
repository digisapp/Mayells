import { describe, it, expect } from 'vitest';
import {
  resolveCommissionPercent,
  computePayoutAmounts,
  FALLBACK_COMMISSION_PERCENT,
  type CommissionSettings,
} from '../commission';

const settings: CommissionSettings = {
  defaultCommissionPercent: 25,
  highValueCommissionPercent: 15,
  highValueThreshold: 1_000_000, // $10,000
};

describe('resolveCommissionPercent', () => {
  it('prefers the consignment rate over everything else', () => {
    expect(
      resolveCommissionPercent({
        hammerPrice: 2_000_000,
        consignmentPercent: 18,
        prospectAgreedPercent: 20,
        settings,
      }),
    ).toBe(18);
  });

  it('falls back to the prospect agreed rate when no consignment rate', () => {
    expect(
      resolveCommissionPercent({
        hammerPrice: 50_000,
        consignmentPercent: null,
        prospectAgreedPercent: 20,
        settings,
      }),
    ).toBe(20);
  });

  it('a 0% agreed rate is honored, not treated as missing', () => {
    expect(
      resolveCommissionPercent({ hammerPrice: 50_000, consignmentPercent: 0, settings }),
    ).toBe(0);
  });

  it('uses the high-value rate at or above the threshold', () => {
    expect(resolveCommissionPercent({ hammerPrice: 1_000_000, settings })).toBe(15);
    expect(resolveCommissionPercent({ hammerPrice: 5_000_000, settings })).toBe(15);
  });

  it('uses the default rate below the threshold', () => {
    expect(resolveCommissionPercent({ hammerPrice: 999_999, settings })).toBe(25);
  });

  it('ignores out-of-range agreed rates', () => {
    expect(
      resolveCommissionPercent({ hammerPrice: 50_000, consignmentPercent: 130, settings }),
    ).toBe(25);
    expect(
      resolveCommissionPercent({ hammerPrice: 50_000, consignmentPercent: -5, settings }),
    ).toBe(25);
  });

  it('falls back to the house constant with no settings row', () => {
    expect(resolveCommissionPercent({ hammerPrice: 50_000, settings: null })).toBe(
      FALLBACK_COMMISSION_PERCENT,
    );
  });
});

describe('computePayoutAmounts', () => {
  it('splits hammer into commission and net that sum exactly', () => {
    const { commissionAmount, netAmount } = computePayoutAmounts(123_457, 25);
    expect(commissionAmount).toBe(30_864); // round(30864.25)
    expect(netAmount).toBe(92_593);
    expect(commissionAmount + netAmount).toBe(123_457);
  });

  it('handles 0% and 100%', () => {
    expect(computePayoutAmounts(100_000, 0)).toEqual({ commissionAmount: 0, netAmount: 100_000 });
    expect(computePayoutAmounts(100_000, 100)).toEqual({ commissionAmount: 100_000, netAmount: 0 });
  });

  it('rejects invalid inputs', () => {
    expect(() => computePayoutAmounts(-1, 25)).toThrow();
    expect(() => computePayoutAmounts(100.5, 25)).toThrow();
    expect(() => computePayoutAmounts(100, 101)).toThrow();
    expect(() => computePayoutAmounts(100, NaN)).toThrow();
  });
});
