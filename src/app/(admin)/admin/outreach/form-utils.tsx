'use client';

/**
 * Small helpers shared by the outreach forms: server field-error plumbing and
 * a consistent inline error line.
 */

export type FieldErrors = Record<string, string[] | undefined>;

export interface ApiFailure {
  error: string;
  details?: FieldErrors;
}

/** Parse an error response without assuming JSON (proxies, 413s…). */
export async function readFailure(res: Response, fallback: string): Promise<ApiFailure> {
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    try {
      const d = await res.json();
      if (d && typeof d.error === 'string') {
        return { error: d.error, details: d.details && typeof d.details === 'object' ? d.details : undefined };
      }
    } catch { /* fall through */ }
  }
  return { error: `${fallback} (${res.status})` };
}

export function FieldError({ errors, name }: { errors: FieldErrors; name: string }) {
  const msg = errors[name]?.[0];
  if (!msg) return null;
  return <p className="text-xs text-destructive mt-1">{msg}</p>;
}

/** Format a date-only column (YYYY-MM-DD) without the UTC day-shift. */
export function formatDay(day: string | null | undefined): string {
  if (!day) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(day);
  if (!m) return new Date(day).toLocaleDateString();
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toLocaleDateString();
}

/** Today as YYYY-MM-DD in the operator's local timezone. */
export function todayLocal(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
