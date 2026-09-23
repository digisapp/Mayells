import { describe, expect, it } from 'vitest';
import { BUSINESS } from '@/lib/config';
import { MICROSITES, getMicrositeByNumber, micrositePhone } from '../config';

describe('city phone lines', () => {
  it('falls back to the main line for a city without its own number', () => {
    const site = MICROSITES.find((m) => !m.phone);
    if (!site) return;
    expect(micrositePhone(site)).toEqual({ display: BUSINESS.phone, href: BUSINESS.phoneHref });
  });

  it('does not map the main line or unknown numbers to a city', () => {
    expect(getMicrositeByNumber(BUSINESS.phoneHref.replace(/^tel:/, ''))).toBeUndefined();
    expect(getMicrositeByNumber('+15550000000')).toBeUndefined();
    expect(getMicrositeByNumber(undefined)).toBeUndefined();
  });

  it('gives every configured city number a unique E.164 form', () => {
    const numbers = MICROSITES.flatMap((m) => (m.phone ? [m.phone.e164] : []));
    for (const n of numbers) expect(n).toMatch(/^\+1\d{10}$/);
    expect(new Set(numbers).size).toBe(numbers.length);
    for (const m of MICROSITES) if (m.phone) expect(getMicrositeByNumber(m.phone.e164)).toBe(m);
  });
});
