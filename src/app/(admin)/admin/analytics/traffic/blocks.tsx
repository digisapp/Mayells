import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { Pair, RankedRow } from '@/lib/admin/traffic-stats';

/** Signed change against the previous period, or null when there is nothing to compare. */
function change(pair: Pair): { up: boolean | null; text: string } | null {
  const { current, previous } = pair;
  if (current === 0 && previous === 0) return null;
  if (previous === 0) return { up: true, text: 'up from 0' };
  if (current === previous) return { up: null, text: 'no change' };
  const pct = Math.round(((current - previous) / previous) * 100);
  return { up: current > previous, text: `${pct > 0 ? '+' : ''}${pct}%` };
}

export function StatTile({
  label,
  value,
  sub,
  hint,
  pair,
  previous,
}: {
  label: string;
  value: string;
  sub: string;
  /** Definition on hover, so a number is never ambiguous. */
  hint?: string;
  /** Omitted when the earlier period is not comparable (tracking had not started). */
  pair?: Pair;
  /** "vs the 7 days before". */
  previous: string;
}) {
  const delta = pair ? change(pair) : null;
  return (
    <Card title={hint}>
      <CardContent className="py-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-semibold">{value}</p>
        {delta && (
          <p
            className={cn(
              'mt-1 flex items-center gap-0.5 text-xs',
              delta.up === true && 'text-[#006300]',
              delta.up === false && 'text-red-700',
              delta.up === null && 'text-muted-foreground',
            )}
          >
            {delta.up === true && <ArrowUpRight className="h-3.5 w-3.5" aria-label="Up" />}
            {delta.up === false && <ArrowDownRight className="h-3.5 w-3.5" aria-label="Down" />}
            <span>
              {delta.text} <span className="text-muted-foreground">{previous}</span>
            </span>
          </p>
        )}
        <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
      </CardContent>
    </Card>
  );
}

/** Ranked rows with a thin bar each, the value at the tip. */
export function BarList({
  rows,
  columns,
  empty,
  color = '#2a78d6',
}: {
  rows: RankedRow[];
  /** Header labels: [what, value, secondary?]. */
  columns: [string, string, string?];
  empty: string;
  color?: string;
}) {
  if (rows.length === 0) return <p className="py-6 text-sm text-muted-foreground">{empty}</p>;
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div>
      <div className="mb-2 flex justify-between text-[11px] uppercase tracking-wider text-muted-foreground">
        <span>{columns[0]}</span>
        <span>
          {columns[1]}
          {columns[2] && <span className="normal-case tracking-normal"> / {columns[2]}</span>}
        </span>
      </div>
      <ul className="space-y-3">
        {rows.map((r) => (
          <li key={`${r.label}|${r.detail ?? ''}`}>
            <div className="flex items-start justify-between gap-3 text-sm">
              <div className="min-w-0">
                {r.href ? (
                  <a href={r.href} target="_blank" rel="noopener noreferrer" className="block truncate font-medium hover:underline">
                    {r.label}
                  </a>
                ) : (
                  <p className="truncate font-medium">{r.label}</p>
                )}
                {r.detail && <p className="truncate text-xs text-muted-foreground">{r.detail}</p>}
              </div>
              <p className="shrink-0 font-medium tabular-nums">
                {r.value.toLocaleString()}
                {r.secondary !== undefined && (
                  <span className="font-normal text-muted-foreground"> / {r.secondary.toLocaleString()}</span>
                )}
              </p>
            </div>
            <div
              className="mt-1.5 h-1.5 rounded-full"
              style={{ width: `max(${(r.value / max) * 100}%, 2px)`, background: color }}
              aria-hidden
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * One path from first contact to a lead, as bars measured against the first
 * step, with the share that went on from each step to the next.
 */
export function Funnel({ title, note, steps }: { title: string; note?: string; steps: Array<{ label: string; value: number }> }) {
  const first = Math.max(1, steps[0]?.value ?? 0);
  return (
    <div>
      <p className="text-sm font-medium">{title}</p>
      {note && <p className="text-xs text-muted-foreground">{note}</p>}
      <ol className="mt-3 space-y-2.5">
        {steps.map((step, i) => {
          const prior = i > 0 ? steps[i - 1].value : null;
          return (
            <li key={step.label}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span>{step.label}</span>
                <span className="shrink-0 tabular-nums">
                  <span className="font-medium">{step.value.toLocaleString()}</span>
                  {prior !== null && (
                    <span className="ml-1.5 text-xs text-muted-foreground">
                      {prior > 0 ? `${((step.value / prior) * 100).toFixed(step.value / prior < 0.1 ? 1 : 0)}%` : '—'}
                    </span>
                  )}
                </span>
              </div>
              <div
                className="mt-1 h-2 rounded-r-[4px]"
                style={{ width: `max(${(step.value / first) * 100}%, 2px)`, background: '#2a78d6' }}
                aria-hidden
              />
            </li>
          );
        })}
      </ol>
    </div>
  );
}
