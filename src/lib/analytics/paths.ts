/**
 * Routes whose last segment is a secret: whoever holds the URL holds the
 * access (a seller's upload page, an invoice, a report). The token must
 * never reach the traffic log, so the whole route collapses to one row.
 */
const TOKEN_ROUTES = ['/upload/', '/invoices/', '/appraisal-report/', '/consignor/'];

/** Staff pages, APIs, and the microsites' internal rewrite target are not traffic. */
const EXCLUDED = /^\/(admin|api|_next|sites)(\/|$)/;

const MAX_PATH = 200;

/**
 * The path as the traffic log stores it: no query string or fragment (they
 * carry tokens and email addresses), no trailing slash, tokens replaced.
 * Null for anything that should not be counted.
 */
export function normalizePath(raw: string): string | null {
  let path = raw.split(/[?#]/)[0].replace(/\/{2,}/g, '/');
  if (!path.startsWith('/')) return null;
  if (path.length > 1) path = path.replace(/\/+$/, '');
  if (EXCLUDED.test(path)) return null;
  for (const prefix of TOKEN_ROUTES) {
    if (path.startsWith(prefix)) return `${prefix}[token]`;
  }
  return path.slice(0, MAX_PATH);
}
