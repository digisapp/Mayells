import type { NextRequest } from 'next/server';

/**
 * Resolve the trusted client IP for rate-limiting and audit logging.
 *
 * SECURITY: Do NOT use the leftmost value of `x-forwarded-for`. A client can
 * send its own `X-Forwarded-For` header; Vercel/most reverse proxies *append*
 * the real connecting IP rather than replacing the header, so the leftmost
 * entry is attacker-controlled and lets an attacker mint a fresh rate-limit
 * bucket per request. Vercel sets `x-real-ip` to the actual connecting IP —
 * prefer it. Fall back to the *rightmost* XFF entry (the last proxy hop, i.e.
 * the one our own infra appended) only if `x-real-ip` is absent.
 */
export function getClientIp(request: NextRequest): string {
  const realIp = request.headers.get('x-real-ip')?.trim();
  if (realIp) return realIp;

  const xff = request.headers.get('x-forwarded-for');
  if (xff) {
    const parts = xff
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length > 0) return parts[parts.length - 1];
  }

  return 'unknown';
}
