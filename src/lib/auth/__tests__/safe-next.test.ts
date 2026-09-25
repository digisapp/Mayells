import { describe, expect, it } from 'vitest';
import { safeNext } from '../safe-next';

describe('safeNext', () => {
  it('keeps internal paths, with their query', () => {
    expect(safeNext('/lots/abc')).toBe('/lots/abc');
    expect(safeNext('/search?q=rolex')).toBe('/search?q=rolex');
  });

  it('falls back to the homepage for anything that could leave the site', () => {
    expect(safeNext(undefined)).toBe('/');
    expect(safeNext('')).toBe('/');
    expect(safeNext('https://evil.example')).toBe('/');
    expect(safeNext('//evil.example')).toBe('/');
    expect(safeNext('/\\evil.example')).toBe('/');
  });

  it('refuses control characters browsers strip into a protocol-relative URL', () => {
    expect(safeNext('/\t/evil.example')).toBe('/');
    expect(safeNext('/\n/evil.example')).toBe('/');
    expect(safeNext('/\r\n/evil.example')).toBe('/');
    expect(safeNext('/lots\\..\\..\\evil')).toBe('/');
  });
});
