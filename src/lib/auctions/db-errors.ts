/**
 * True for a Postgres unique violation (23505). Drizzle wraps the driver
 * error, so the code can sit on the error itself or on `cause`.
 */
export function isUniqueViolation(err: unknown): boolean {
  const candidates = [err, (err as { cause?: unknown })?.cause];
  return candidates.some((c) => (c as { code?: string } | undefined)?.code === '23505');
}

/** The one message for a sale whose URL slug another sale already uses. */
export const SLUG_IN_USE_ERROR = 'That URL slug is already in use';
