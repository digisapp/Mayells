/**
 * Date formatting in the house timezone. The server renders in UTC, so any
 * date formatted without a timeZone can show a different day than the one
 * staff and bidders see (an 8pm ET close lands on "tomorrow" in UTC). Every
 * user-facing date goes through these helpers. Safe on server and client:
 * output is whitespace-normalised, because ICU versions differ (Safari puts a
 * narrow no-break space before "PM", Node a plain one) and a mismatch between
 * the server render and the browser would be a React hydration error.
 */

export const HOUSE_TIME_ZONE = 'America/New_York';

type DateInput = Date | string | number;

const toDate = (d: DateInput) => (d instanceof Date ? d : new Date(d));

/** Collapse ICU's narrow/no-break spaces so every runtime prints the same text. */
const clean = (s: string) => s.replace(/[\u00a0\u202f\u2009]/g, ' ');

const longDate = new Intl.DateTimeFormat('en-US', {
  month: 'long',
  day: 'numeric',
  year: 'numeric',
  timeZone: HOUSE_TIME_ZONE,
});

const shortDate = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: HOUSE_TIME_ZONE,
});

// Date+time strings are assembled from parts rather than taken whole from
// Intl: ICU versions disagree on the glue ("Nov 5 at 7:00 PM" vs
// "Nov 5, 7:00 PM"), and server and browser must print identical text.
const dateTimeParts = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'long',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
  timeZone: HOUSE_TIME_ZONE,
});

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function partsOf(d: Date) {
  const parts = dateTimeParts.formatToParts(d);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? '';
  const month = get('month');
  return {
    weekday: get('weekday'),
    month,
    monthShort: MONTH_SHORT[
      ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].indexOf(month)
    ] ?? month.slice(0, 3),
    day: get('day'),
    year: get('year'),
    time: `${get('hour')}:${get('minute')} ${get('dayPeriod').toUpperCase()}`,
  };
}

/** "November 5, 2026" */
export function formatLongDate(d: DateInput): string {
  return clean(longDate.format(toDate(d)));
}

/** "Nov 5, 2026" */
export function formatShortDate(d: DateInput): string {
  return clean(shortDate.format(toDate(d)));
}

/** "Nov 5, 2026, 7:00 PM ET" */
export function formatShortDateTime(d: DateInput): string {
  const p = partsOf(toDate(d));
  return `${p.monthShort} ${p.day}, ${p.year}, ${p.time} ET`;
}

/**
 * "Thu, November 5 at 7:00 PM ET" — sale opening/closing lines. The year is
 * added only when it isn't the current one ("Mon, January 4, 2027 at …").
 */
export function formatSaleMoment(d: DateInput, now: Date = new Date()): string {
  const p = partsOf(toDate(d));
  const year = p.year === partsOf(now).year ? '' : `, ${p.year}`;
  return `${p.weekday}, ${p.month} ${p.day}${year} at ${p.time} ET`;
}

/**
 * A date-only column ("2026-09-28") formatted without the UTC day shift that
 * `new Date("2026-09-28")` causes.
 */
export function formatDayOnly(day: string | null | undefined, style: 'short' | 'long' = 'short'): string {
  if (!day) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(day);
  if (!m) return style === 'long' ? formatLongDate(day) : formatShortDate(day);
  const utcNoon = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12));
  return style === 'long' ? formatLongDate(utcNoon) : formatShortDate(utcNoon);
}

/** Today in the house timezone as YYYY-MM-DD (for date inputs' value/max). */
export function todayInHouseTz(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: HOUSE_TIME_ZONE,
  }).format(now);
  return parts; // en-CA formats as YYYY-MM-DD
}

/** YYYY-MM-DD plus `days`, calendar arithmetic with no timezone drift. */
export function addDaysToDay(day: string, days: number): string {
  const [y, m, d] = day.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return t.toISOString().slice(0, 10);
}
