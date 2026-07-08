/**
 * Parse and clamp `limit`/`offset` query params.
 *
 * Guards against the NaN/negative/huge values that otherwise reach Postgres
 * (`?offset=abc` or `?limit=-5` → a query error → 500): limit is clamped to
 * [1, maxLimit], offset to [0, ∞), and non-numeric input falls back to the
 * defaults.
 */
export function parsePagination(
  params: URLSearchParams,
  opts?: { defaultLimit?: number; maxLimit?: number },
): { limit: number; offset: number } {
  const maxLimit = opts?.maxLimit ?? 100;
  const defaultLimit = opts?.defaultLimit ?? 20;

  // Treat absent/empty as "not provided" — Number(null) and Number('') are 0
  // (finite), which would otherwise clamp to 1 instead of using the default.
  const limitStr = params.get('limit');
  const offsetStr = params.get('offset');
  const rawLimit = limitStr === null || limitStr === '' ? NaN : Number(limitStr);
  const rawOffset = offsetStr === null || offsetStr === '' ? NaN : Number(offsetStr);

  const limit = Number.isFinite(rawLimit)
    ? Math.min(Math.max(Math.trunc(rawLimit), 1), maxLimit)
    : defaultLimit;
  const offset = Number.isFinite(rawOffset) ? Math.max(Math.trunc(rawOffset), 0) : 0;

  return { limit, offset };
}
