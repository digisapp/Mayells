import { describe, it, expect } from 'vitest';
import { parsePagination } from '../pagination';

function sp(obj: Record<string, string>) {
  return new URLSearchParams(obj);
}

describe('parsePagination', () => {
  it('uses defaults when params are absent', () => {
    expect(parsePagination(sp({}))).toEqual({ limit: 20, offset: 0 });
  });

  it('honors custom defaults', () => {
    expect(parsePagination(sp({}), { defaultLimit: 50, maxLimit: 100 })).toEqual({
      limit: 50,
      offset: 0,
    });
  });

  it('parses valid values', () => {
    expect(parsePagination(sp({ limit: '25', offset: '10' }))).toEqual({ limit: 25, offset: 10 });
  });

  it('clamps limit to maxLimit', () => {
    expect(parsePagination(sp({ limit: '9999' }), { maxLimit: 50 }).limit).toBe(50);
  });

  it('clamps limit to a minimum of 1', () => {
    expect(parsePagination(sp({ limit: '0' })).limit).toBe(1);
    expect(parsePagination(sp({ limit: '-5' })).limit).toBe(1);
  });

  it('clamps negative offset to 0', () => {
    expect(parsePagination(sp({ offset: '-100' })).offset).toBe(0);
  });

  it('falls back to defaults on non-numeric input (no NaN reaches the DB)', () => {
    const result = parsePagination(sp({ limit: 'abc', offset: 'xyz' }), { defaultLimit: 20 });
    expect(result.limit).toBe(20);
    expect(result.offset).toBe(0);
    expect(Number.isNaN(result.limit)).toBe(false);
    expect(Number.isNaN(result.offset)).toBe(false);
  });

  it('truncates fractional values', () => {
    expect(parsePagination(sp({ limit: '10.9', offset: '3.7' }))).toEqual({ limit: 10, offset: 3 });
  });
});
