import { describe, it, expect } from 'vitest';
import { isAdminProfile } from '../admin';

describe('isAdminProfile', () => {
  it('accepts either admin signal', () => {
    expect(isAdminProfile({ role: 'admin' })).toBe(true);
    expect(isAdminProfile({ role: 'buyer', is_admin: true })).toBe(true);
    expect(isAdminProfile({ role: 'buyer', isAdmin: true })).toBe(true);
  });

  it('rejects non-admins and missing profiles', () => {
    expect(isAdminProfile({ role: 'buyer' })).toBe(false);
    expect(isAdminProfile(null)).toBe(false);
  });

  it('rejects suspended or banned admins', () => {
    expect(isAdminProfile({ role: 'admin', accountStatus: 'suspended' })).toBe(false);
    expect(isAdminProfile({ is_admin: true, account_status: 'banned' })).toBe(false);
    expect(isAdminProfile({ role: 'admin', accountStatus: 'active' })).toBe(true);
  });
});
