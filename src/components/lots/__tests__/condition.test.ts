import { describe, it, expect } from 'vitest';
import { formatCondition } from '../condition';

describe('formatCondition', () => {
  it('labels every catalogue condition in display case', () => {
    expect(formatCondition('excellent')).toBe('Excellent');
    expect(formatCondition('very_good')).toBe('Very Good');
    expect(formatCondition('as_is')).toBe('As Is');
  });

  it('title-cases a value it does not know yet', () => {
    expect(formatCondition('near_mint_plus')).toBe('Near Mint Plus');
  });
});
