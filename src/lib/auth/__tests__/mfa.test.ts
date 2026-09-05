import { describe, it, expect } from 'vitest';
import {
  hasVerifiedTotpFactor,
  needsMfaChallenge,
  isMfaExemptPath,
  MFA_CHALLENGE_PATH,
} from '../mfa';

describe('hasVerifiedTotpFactor', () => {
  it('is false with no factors', () => {
    expect(hasVerifiedTotpFactor(undefined)).toBe(false);
    expect(hasVerifiedTotpFactor(null)).toBe(false);
    expect(hasVerifiedTotpFactor([])).toBe(false);
  });

  it('ignores unverified enrollments (an abandoned QR must not lock anyone out)', () => {
    expect(hasVerifiedTotpFactor([{ factor_type: 'totp', status: 'unverified' }])).toBe(false);
  });

  it('ignores non-TOTP factor types', () => {
    expect(hasVerifiedTotpFactor([{ factor_type: 'phone', status: 'verified' }])).toBe(false);
  });

  it('is true once a TOTP factor is verified', () => {
    expect(
      hasVerifiedTotpFactor([
        { factor_type: 'totp', status: 'unverified' },
        { factor_type: 'totp', status: 'verified' },
      ]),
    ).toBe(true);
  });
});

describe('needsMfaChallenge', () => {
  it('never gates accounts that have not enrolled', () => {
    expect(needsMfaChallenge({ mfaEnrolled: false, aal: 'aal1' })).toBe(false);
    expect(needsMfaChallenge({ mfaEnrolled: false, aal: undefined })).toBe(false);
  });

  it('gates enrolled accounts until the session reaches aal2', () => {
    expect(needsMfaChallenge({ mfaEnrolled: true, aal: 'aal1' })).toBe(true);
    expect(needsMfaChallenge({ mfaEnrolled: true, aal: null })).toBe(true);
    expect(needsMfaChallenge({ mfaEnrolled: true, aal: 'aal2' })).toBe(false);
  });
});

describe('isMfaExemptPath', () => {
  it('keeps the login, challenge and auth API reachable', () => {
    expect(isMfaExemptPath('/admin/login')).toBe(true);
    expect(isMfaExemptPath(MFA_CHALLENGE_PATH)).toBe(true);
    expect(isMfaExemptPath('/api/auth/logout')).toBe(true);
    expect(isMfaExemptPath('/api/auth/mfa/refresh')).toBe(true);
  });

  it('gates everything else', () => {
    expect(isMfaExemptPath('/admin')).toBe(false);
    expect(isMfaExemptPath('/admin/lots')).toBe(false);
    expect(isMfaExemptPath('/api/admin/prospects')).toBe(false);
    expect(isMfaExemptPath('/api/lots/abc/bids')).toBe(false);
  });
});
