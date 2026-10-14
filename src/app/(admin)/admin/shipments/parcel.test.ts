import { describe, expect, it } from 'vitest';
import { parseParcel, parseParcelField } from './parcel';

describe('parseParcelField', () => {
  it('clears on blank', () => {
    expect(parseParcelField('')).toBeNull();
    expect(parseParcelField('   ')).toBeNull();
  });

  it('accepts whole numbers, including 0 and thousands separators', () => {
    expect(parseParcelField('0')).toBe(0);
    expect(parseParcelField(' 24 ')).toBe(24);
    expect(parseParcelField('1,200')).toBe(1200);
    expect(parseParcelField('100000')).toBe(100000);
  });

  it('rejects decimals, negatives, text and out-of-range values instead of nulling them', () => {
    expect(parseParcelField('2.5')).toBeUndefined();
    expect(parseParcelField('-1')).toBeUndefined();
    expect(parseParcelField('abc')).toBeUndefined();
    expect(parseParcelField('12in')).toBeUndefined();
    expect(parseParcelField('100001')).toBeUndefined();
  });
});

describe('parseParcel', () => {
  it('returns every field when all are valid', () => {
    expect(parseParcel({ lengthIn: '10', widthIn: '', heightIn: '4', weightLbs: '2', weightOz: '8' })).toEqual({
      ok: true,
      values: { lengthIn: 10, widthIn: null, heightIn: 4, weightLbs: 2, weightOz: 8 },
    });
  });

  it('names the invalid fields', () => {
    expect(parseParcel({ lengthIn: '2.5', widthIn: '3', heightIn: 'x', weightLbs: '', weightOz: '-1' })).toEqual({
      ok: false,
      invalid: ['Length', 'Height', 'Ounces'],
    });
  });
});
