import Link from 'next/link';
import { cn } from '@/lib/utils';

export type AnalyticsRange = '30d' | '90d' | 'all';

export const RANGES: ReadonlyArray<{ value: AnalyticsRange; label: string; days: number | null }> = [
  { value: '30d', label: 'Last 30 days', days: 30 },
  { value: '90d', label: 'Last 90 days', days: 90 },
  { value: 'all', label: 'All time', days: null },
];

export function parseRange(value: string | undefined): AnalyticsRange {
  return RANGES.some((r) => r.value === value) ? (value as AnalyticsRange) : '30d';
}

/** Server-rendered link group — the page re-renders with the new searchParam. */
export function RangeSwitch({ current }: { current: AnalyticsRange }) {
  return (
    <div className="inline-flex rounded-md border bg-muted/40 p-0.5" role="group" aria-label="Time range">
      {RANGES.map((r) => (
        <Link
          key={r.value}
          href={r.value === '30d' ? '/admin/analytics?view=sales' : `/admin/analytics?view=sales&range=${r.value}`}
          aria-current={r.value === current ? 'page' : undefined}
          className={cn(
            'px-3 py-1 rounded text-xs font-medium transition-colors',
            r.value === current ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {r.label}
        </Link>
      ))}
    </div>
  );
}
