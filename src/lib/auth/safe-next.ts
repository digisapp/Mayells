const BASE = 'http://mayells.invalid';

/**
 * An internal same-origin path from `?next=`, or '/'; blocks open redirects.
 * Browsers drop tabs and newlines from URLs and read `\` as `/`, so
 * `/\t/evil.com` would reach a Location header as `//evil.com`: any control
 * character or backslash is refused, and what's left must resolve on-site.
 */
export function safeNext(next?: string): string {
  if (!next || !next.startsWith('/') || next.startsWith('//')) return '/';
  if (/[\u0000-\u001f\u007f\\]/.test(next)) return '/';
  try {
    if (new URL(next, BASE).origin !== BASE) return '/';
  } catch {
    return '/';
  }
  return next;
}

/**
 * `?next=` for the admin sign-in pages: a safeNext() path that stays inside
 * the admin and never points back at the login pages; otherwise '/admin'.
 * Shared by the middleware and the admin sign-in forms so both apply one rule.
 */
export function safeAdminNext(raw: string | null | undefined): string {
  const next = safeNext(raw ?? undefined);
  return /^\/admin(?:[/?#]|$)/.test(next) && !next.startsWith('/admin/login') ? next : '/admin';
}
