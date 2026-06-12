import { describe, it, expect } from 'vitest';
import { getMinIncrement, getNextMinBid, getQuickBidOptions, INCREMENT_TIERS } from '../bid-increments';

describe('getMinIncrement', () => {
  it('returns $10 increment for bids under $100', () => {
    expect(getMinIncrement(0)).toBe(1_000);
    expect(getMinIncrement(5_000)).toBe(1_000);
    expect(getMinIncrement(9_999)).toBe(1_000);
  });

  it('returns $25 increment for bids $100-$499', () => {
    expect(getMinIncrement(10_000)).toBe(2_500);
    expect(getMinIncrement(25_000)).toBe(2_500);
    expect(getMinIncrement(49_999)).toBe(2_500);
  });

  it('returns $50 increment for bids $500-$999', () => {
    expect(getMinIncrement(50_000)).toBe(5_000);
    expect(getMinIncrement(99_999)).toBe(5_000);
  });

  it('returns $100 increment for bids $1K-$2K', () => {
    expect(getMinIncrement(100_000)).toBe(10_000);
    expect(getMinIncrement(199_999)).toBe(10_000);
  });

  it('returns $500 increment for bids $5K-$10K', () => {
    expect(getMinIncrement(500_000)).toBe(50_000);
  });

  it('returns $10,000 increment for bids over $100K', () => {
    expect(getMinIncrement(10_000_000)).toBe(1_000_000);
    expect(getMinIncrement(50_000_000)).toBe(1_000_000);
  });
});

describe('getNextMinBid', () => {
  it('returns current bid plus the correct increment', () => {
    expect(getNextMinBid(0)).toBe(1_000); // $0 -> $10
    expect(getNextMinBid(5_000)).toBe(6_000); // $50 -> $60
    expect(getNextMinBid(10_000)).toBe(12_500); // $100 -> $125
    expect(getNextMinBid(100_000)).toBe(110_000); // $1000 -> $1100
  });
});

describe('INCREMENT_TIERS', () => {
  it('is JSON-serializable and round-trips without loss (no Infinity values)', () => {
    const roundTripped = JSON.parse(JSON.stringify(INCREMENT_TIERS));
    expect(roundTripped).toEqual(INCREMENT_TIERS);
    for (const tier of roundTripped) {
      expect(Number.isFinite(tier.threshold)).toBe(true);
      expect(Number.isFinite(tier.increment)).toBe(true);
      expect(Number.isInteger(tier.threshold)).toBe(true);
      expect(Number.isInteger(tier.increment)).toBe(true);
    }
  });

  it('has ascending thresholds starting at 0', () => {
    expect(INCREMENT_TIERS[0].threshold).toBe(0);
    for (let i = 1; i < INCREMENT_TIERS.length; i++) {
      expect(INCREMENT_TIERS[i].threshold).toBeGreaterThan(INCREMENT_TIERS[i - 1].threshold);
    }
  });

  it('the Lua-style lookup (last tier with threshold <= amount) matches getMinIncrement', () => {
    // Mirrors the loop inside the bid engine's Lua script.
    const luaStyleLookup = (currentAmount: number): number => {
      let increment = INCREMENT_TIERS[0].increment;
      for (const tier of INCREMENT_TIERS) {
        if (currentAmount >= tier.threshold) {
          increment = tier.increment;
        }
      }
      return increment;
    };

    const samples = [
      0, 1, 5_000, 9_999, 10_000, 10_500, 49_999, 50_000, 99_999,
      100_000, 199_999, 200_000, 499_999, 500_000, 999_999,
      1_000_000, 1_999_999, 2_000_000, 4_999_999, 5_000_000,
      9_999_999, 10_000_000, 50_000_000,
    ];
    for (const amount of samples) {
      expect(luaStyleLookup(amount)).toBe(getMinIncrement(amount));
    }
  });

  it('demonstrates the bug-2 regression case: $95 current allows a $105 bid', () => {
    // Increment must come from the CURRENT amount ($95 -> $10 tier),
    // not from the incoming bid ($105 -> $25 tier).
    const current = 9_500;
    const incomingBid = 10_500;
    const minRequired = current + getMinIncrement(current);
    expect(minRequired).toBe(10_500);
    expect(incomingBid).toBeGreaterThanOrEqual(minRequired);
    // The old (buggy) computation used getMinIncrement(incomingBid), i.e.
    // the $25 tier, requiring $120 and wrongly rejecting the valid $105 bid.
    expect(current + getMinIncrement(incomingBid)).toBe(12_000);
  });
});

describe('getQuickBidOptions', () => {
  it('returns 3 options at 1x, 2x, and 5x increment', () => {
    const options = getQuickBidOptions(10_000); // $100, increment is $25
    expect(options).toEqual([12_500, 15_000, 22_500]);
  });

  it('returns correct options for low bids', () => {
    const options = getQuickBidOptions(0); // $0, increment is $10
    expect(options).toEqual([1_000, 2_000, 5_000]);
  });

  it('returns correct options for high bids', () => {
    const options = getQuickBidOptions(10_000_000); // $100K, increment is $10K
    expect(options).toEqual([11_000_000, 12_000_000, 15_000_000]);
  });
});
