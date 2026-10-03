import { HOUSE_TIME_ZONE } from '@/lib/format/dates';

const timeOnly = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: HOUSE_TIME_ZONE });
const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: HOUSE_TIME_ZONE });
const thisYear = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: HOUSE_TIME_ZONE });
const older = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: HOUSE_TIME_ZONE });
const dayKey = new Intl.DateTimeFormat('en-US', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: HOUSE_TIME_ZONE });
const yearOf = new Intl.DateTimeFormat('en-US', { year: 'numeric', timeZone: HOUSE_TIME_ZONE });
const full = new Intl.DateTimeFormat('en-US', {
  weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: HOUSE_TIME_ZONE,
});

/** "3:04 PM" today; "Tue" this week; "Sep 28" this year; "Sep 28, 2025" older. */
export function formatListDate(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  if (dayKey.format(d) === dayKey.format(now)) return timeOnly.format(d);
  const days = (now.getTime() - d.getTime()) / 86_400_000;
  if (days >= 0 && days < 6) return weekday.format(d);
  return yearOf.format(d) === yearOf.format(now) ? thisYear.format(d) : older.format(d);
}

/** "Tue, Sep 28, 2026, 3:04 PM" */
export function formatFullDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : full.format(d);
}
