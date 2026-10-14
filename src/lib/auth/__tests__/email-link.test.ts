import { describe, it, expect } from 'vitest';
import { emailLinkConfirmPath, emailLinkDestination, emailOtpType } from '../email-link';

describe('emailOtpType', () => {
  it('accepts the email-link types the app sends', () => {
    for (const t of ['recovery', 'signup', 'email']) {
      expect(emailOtpType(t)).toBe(t);
    }
  });

  it('refuses anything else', () => {
    expect(emailOtpType(null)).toBeNull();
    expect(emailOtpType(undefined)).toBeNull();
    expect(emailOtpType('')).toBeNull();
    expect(emailOtpType('sms')).toBeNull();
    expect(emailOtpType('magiclink')).toBeNull();
    expect(emailOtpType('invite')).toBeNull();
    expect(emailOtpType('email_change')).toBeNull();
    expect(emailOtpType('RECOVERY')).toBeNull();
  });
});

describe('emailLinkConfirmPath', () => {
  it('carries the token, type and next to the confirm page, encoded', () => {
    expect(emailLinkConfirmPath('abc&x=1', 'recovery', '/reset-password')).toBe(
      '/auth/confirm?token_hash=abc%26x%3D1&type=recovery&next=%2Freset-password',
    );
  });
});

describe('emailLinkDestination', () => {
  it('sends a reset with no next to the new-password page', () => {
    expect(emailLinkDestination('recovery', '/')).toBe('/reset-password');
    expect(emailLinkDestination('recovery', '/watchlist')).toBe('/watchlist');
    expect(emailLinkDestination('email', '/')).toBe('/');
  });
});
