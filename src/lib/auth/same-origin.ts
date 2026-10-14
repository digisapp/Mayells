import { NextResponse } from 'next/server';

/**
 * CSRF guard for the auth POST routes.
 *
 * These routes set or clear the session cookie, so a cross-site page that
 * can post to them can sign a visitor into an account the attacker controls
 * (then watch what they bid on), or sign them out. Two checks:
 *
 * - JSON only. A plain HTML form can send text/plain but never
 *   application/json, and a cross-site fetch with that type needs a CORS
 *   preflight we never grant.
 * - A present Origin must be this site. Same rule as Next's Server Actions:
 *   the Origin host matches the Host (or X-Forwarded-Host) the request was
 *   sent to, which a browser on another site cannot fake. The configured app
 *   URL is accepted too, for a proxy that rewrites Host. "null" (sandboxed
 *   frames, file: pages) is refused. No Origin at all is let through: browsers
 *   always send one on a cross-site POST, so its absence means a same-origin
 *   request from an older browser or a non-browser client.
 */

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://mayells.com';

function appOrigin(): string | null {
  try {
    return new URL(APP_URL).origin;
  } catch {
    return null;
  }
}

function requestHost(req: Request): string | null {
  // X-Forwarded-Host may be a list; the first entry is the host the client used.
  const forwarded = req.headers.get('x-forwarded-host')?.split(',')[0]?.trim();
  if (forwarded) return forwarded.toLowerCase();
  const host = req.headers.get('host')?.trim();
  if (host) return host.toLowerCase();
  try {
    return new URL(req.url).host.toLowerCase();
  } catch {
    return null;
  }
}

/** True when the request's Origin header is absent or names this site. */
export function isSameOriginRequest(req: Request): boolean {
  const origin = req.headers.get('origin');
  if (origin === null) return true;
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    return false; // includes the literal "null"
  }
  if (parsed.origin === appOrigin()) return true;
  const host = requestHost(req);
  return host !== null && parsed.host.toLowerCase() === host;
}

/** True when the body is declared as JSON (any charset parameter is fine). */
export function isJsonRequest(req: Request): boolean {
  const type = req.headers.get('content-type');
  return type?.split(';')[0].trim().toLowerCase() === 'application/json';
}

/**
 * A ready-to-return error response when the request fails the guard, else
 * null. `json: false` for bodiless POSTs (sign out, MFA refresh), which check
 * the origin only.
 */
export function rejectCrossSiteAuthRequest(req: Request, opts: { json?: boolean } = {}): NextResponse | null {
  if (!isSameOriginRequest(req)) {
    return NextResponse.json(
      { error: 'This request must come from the Mayells website. Reload the page and try again.' },
      { status: 403 },
    );
  }
  if ((opts.json ?? true) && !isJsonRequest(req)) {
    return NextResponse.json({ error: 'Send this request as JSON.' }, { status: 415 });
  }
  return null;
}
