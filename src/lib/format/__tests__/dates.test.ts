import { describe, expect, it } from 'vitest';
import { addDaysToDay, formatDayOnly, formatLongDate, formatSaleMoment, formatShortDateTime, todayInHouseTz } from '../dates';
import { formatEstimate } from '../estimate';

describe('house-timezone dates', () => {
  it('keeps an evening Eastern time on its own day', () => {
    // 11pm EDT on Oct 1 is 03:00 UTC on Oct 2.
    expect(formatLongDate('2026-10-02T03:00:00Z')).toBe('October 1, 2026');
  });

  it('adds the year to sale moments only outside the current year', () => {
    const now = new Date('2026-09-29T12:00:00Z');
    expect(formatSaleMoment('2026-11-06T00:00:00Z', now)).toBe('Thu, November 5 at 7:00 PM ET');
    expect(formatSaleMoment('2027-01-05T00:00:00Z', now)).toBe('Mon, January 4, 2027 at 7:00 PM ET');
  });

  it('prints plain spaces only (no ICU narrow no-break spaces)', () => {
    expect(formatShortDateTime('2026-11-05T00:00:00Z')).not.toMatch(/[\u00a0\u202f]/);
  });

  it('labels times as ET', () => {
    expect(formatShortDateTime('2026-11-05T00:00:00Z')).toBe('Nov 4, 2026, 7:00 PM ET');
  });

  it('formats date-only columns without a day shift', () => {
    expect(formatDayOnly('2026-09-28')).toBe('Sep 28, 2026');
    expect(formatDayOnly('2026-09-28', 'long')).toBe('September 28, 2026');
    expect(formatDayOnly(null)).toBe('—');
  });

  it('gives today in Eastern time', () => {
    expect(todayInHouseTz(new Date('2026-09-29T02:00:00Z'))).toBe('2026-09-28');
  });

  it('adds days across month ends', () => {
    expect(addDaysToDay('2026-09-28', 7)).toBe('2026-10-05');
  });
});

describe('formatEstimate', () => {
  it('formats a range with one dash style', () => {
    expect(formatEstimate(3_500_000, 5_000_000)).toBe('$35,000–$50,000');
    expect(formatEstimate(10_000_000, 15_000_000, { compact: true })).toBe('$100,000–150,000');
  });
  it('handles one-sided and missing estimates', () => {
    expect(formatEstimate(100_00, null)).toBe('$100+');
    expect(formatEstimate(null, 600_000)).toBe('Up to $6,000');
    expect(formatEstimate(null, null)).toBeNull();
  });
});
