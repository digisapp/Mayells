// Who's signed in, for the public header. Deliberately tiny: it's in every
// public page's bundle, where supabase-js and the dropdown are not.

export type AccountProfile = { email: string; fullName: string | null; isAdmin: boolean };

const UNKNOWN: AccountProfile = { email: '', fullName: null, isAdmin: false };

// Supabase keeps the session in sb-<project>-auth-token (split into .0, .1…
// when large). @supabase/ssr sets it without httpOnly, so it's readable here;
// the -code-verifier cookie of a sign-in in progress doesn't count.
const SESSION_COOKIE = /^sb-[^=]+-auth-token(?:\.\d+)?=/;

function browserCookies(): string {
  return typeof document !== 'undefined' ? document.cookie : '';
}

/**
 * The session cookie(s) as one string, or null when there's none. It changes
 * whenever the session does (another sign-in, a token refresh), so it keys
 * the profile cache: a tab never keeps showing someone who has since signed
 * out elsewhere.
 */
export function sessionKey(cookies = browserCookies()): string | null {
  const parts = cookies
    .split(/;\s*/)
    .filter((c) => SESSION_COOKIE.test(c))
    .sort();
  return parts.length > 0 ? parts.join(';') : null;
}

/** A session cookie is present. It may be stale; loadProfile settles that. */
export function hasSessionCookie(cookies = browserCookies()): boolean {
  return sessionKey(cookies) !== null;
}

// Pages where "come back here after signing in" makes no sense.
const AUTH_PATHS = ['/login', '/signup', '/forgot-password', '/reset-password'];

/** Sign-in link that returns the visitor to this page afterwards. */
export function signInHref(pathname: string): string {
  if (pathname === '/' || AUTH_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return '/login';
  return `/login?next=${encodeURIComponent(pathname)}`;
}

// Fetched once per session, not per navigation: the header outlives them.
let cached: { key: string | null; profile: Promise<AccountProfile | null> } | null = null;

/** The signed-in profile; null only when the server says there's no session. */
export function loadProfile(): Promise<AccountProfile | null> {
  const key = sessionKey();
  if (cached && cached.key === key) return cached.profile;
  const profile = fetch('/api/auth/me')
    .then(async (res) => {
      if (res.status === 401) return null;
      // Signed in but no profile row yet, or a server hiccup: still signed in.
      if (!res.ok) return UNKNOWN;
      const { user } = await res.json();
      return user
        ? { email: user.email ?? '', fullName: user.fullName ?? null, isAdmin: user.isAdmin === true || user.role === 'admin' }
        : UNKNOWN;
    })
    .catch(() => UNKNOWN);
  cached = { key, profile };
  return profile;
}

/** Forget the cached profile, after signing out or finding the session gone. */
export function resetAccountProfile() {
  cached = null;
}
