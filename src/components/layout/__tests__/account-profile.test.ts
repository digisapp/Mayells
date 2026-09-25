import { describe, expect, it } from 'vitest';
import { hasSessionCookie, sessionKey, signInHref } from '../account-profile';

describe('hasSessionCookie', () => {
  it('sees the Supabase session cookie, whole or chunked', () => {
    expect(hasSessionCookie('sb-abcd1234-auth-token=base64-eyJ')).toBe(true);
    expect(hasSessionCookie('theme=light; sb-abcd1234-auth-token.0=base64-eyJ; sb-abcd1234-auth-token.1=xyz')).toBe(true);
  });

  it('ignores the code verifier of a sign-in in progress, and other cookies', () => {
    expect(hasSessionCookie('sb-abcd1234-auth-token-code-verifier=abc')).toBe(false);
    expect(hasSessionCookie('theme=light; _vercel_jwt=x')).toBe(false);
    expect(hasSessionCookie('')).toBe(false);
  });
});

describe('signInHref', () => {
  it('returns the visitor to the page they were on', () => {
    expect(signInHref('/lots/george-iii-epergne')).toBe('/login?next=%2Flots%2Fgeorge-iii-epergne');
  });

  it('adds nothing from the homepage or the account pages themselves', () => {
    expect(signInHref('/')).toBe('/login');
    expect(signInHref('/login')).toBe('/login');
    expect(signInHref('/signup')).toBe('/login');
    expect(signInHref('/reset-password')).toBe('/login');
  });
});

describe('sessionKey', () => {
  it('changes with the session, so a new sign-in refetches the profile', () => {
    const a = sessionKey('theme=light; sb-p-auth-token=base64-AAA');
    const b = sessionKey('theme=light; sb-p-auth-token=base64-BBB');
    expect(a).not.toBeNull();
    expect(a).not.toBe(b);
  });

  it('is the same however the chunks are ordered, and null without a session', () => {
    expect(sessionKey('sb-p-auth-token.1=y; sb-p-auth-token.0=x')).toBe(sessionKey('sb-p-auth-token.0=x; sb-p-auth-token.1=y'));
    expect(sessionKey('sb-p-auth-token-code-verifier=abc')).toBeNull();
  });
});
