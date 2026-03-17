import { describe, it, expect } from 'vitest';
import { getMinIncrement, getNextMinBid, getQuickBidOptions } from '../bid-increments';

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
