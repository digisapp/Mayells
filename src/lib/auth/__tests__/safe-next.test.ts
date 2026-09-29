import { describe, expect, it } from 'vitest';
import { safeAdminNext, safeNext } from '../safe-next';

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

describe('safeAdminNext', () => {
  it('keeps admin paths, with their query', () => {
    expect(safeAdminNext('/admin')).toBe('/admin');
    expect(safeAdminNext('/admin/lots/abc')).toBe('/admin/lots/abc');
    expect(safeAdminNext('/admin?tab=today')).toBe('/admin?tab=today');
  });

  it('falls back to /admin outside the admin or back at the login pages', () => {
    expect(safeAdminNext(null)).toBe('/admin');
    expect(safeAdminNext('/')).toBe('/admin');
    expect(safeAdminNext('/lots/abc')).toBe('/admin');
    expect(safeAdminNext('/administrator')).toBe('/admin');
    expect(safeAdminNext('/admin/login')).toBe('/admin');
    expect(safeAdminNext('/admin/login/mfa')).toBe('/admin');
  });

  it('refuses anything safeNext refuses', () => {
    expect(safeAdminNext('//evil.example/admin')).toBe('/admin');
    expect(safeAdminNext('https://evil.example/admin')).toBe('/admin');
    expect(safeAdminNext('/admin\\..\\..\\evil')).toBe('/admin');
  });
});
