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
