'use client';

import { useState } from 'react';
import { Axis, ChartTable, Legend, MARGIN, Tooltip, countTicks, labelIndices, useKeyboardIndex, useWidth } from './chart-parts';

export interface StackSeries {
  name: string;
  color: string;
  values: number[];
}

interface Props {
  buckets: Array<{ label: string; full: string }>;
  /** Bottom of the stack first. */
  series: StackSeries[];
  label: string;
  unit: 'hour' | 'day';
  empty: string;
  height?: number;
}

/** A column whose top corners are rounded and whose base stays square on the baseline. */
function roundedTop(x: number, y: number, w: number, h: number): string {
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

/** Counts per bucket stacked by category, with a readout of every category per column. */
export function StackedColumns({ buckets, series, label, unit, empty, height = 220 }: Props) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const count = buckets.length;

  const totals = buckets.map((_, i) => series.reduce((sum, s) => sum + (s.values[i] ?? 0), 0));
  const plotWidth = Math.max(0, width - MARGIN.left - MARGIN.right);
  const plotHeight = height - MARGIN.top - MARGIN.bottom;
  const ticks = countTicks(Math.max(0, ...totals));
  const top = ticks[ticks.length - 1];
  const band = count > 0 ? plotWidth / count : 0;
  // At most 24px thick, never filling the slot; the 2px between columns is surface.
  const barWidth = Math.max(1, Math.min(24, band - 2));
  const center = (i: number) => MARGIN.left + band * i + band / 2;
  const y = (v: number) => MARGIN.top + plotHeight - (v / top) * plotHeight;
  const labels = [...labelIndices(count, plotWidth)].map((i) => ({ i, text: buckets[i].label }));
  const hasData = totals.some((t) => t > 0);

  function indexAt(clientX: number, target: Element) {
    const px = clientX - target.getBoundingClientRect().left;
    return Math.min(count - 1, Math.max(0, Math.floor((px - MARGIN.left) / band)));
  }

  const keyboard = useKeyboardIndex(count, setActive);

  return (
    <div>
      <Legend kind="rect" items={series} />
      <div
        ref={ref}
        role="group"
        aria-label={`${label}. Use the arrow keys to read each ${unit}.`}
        className="relative outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
        style={{ height }}
        {...keyboard}
      >
        {width > 0 && count > 0 && (
          <svg
            width={width}
            height={height}
            className="block touch-pan-y"
            onPointerMove={(e) => setActive(indexAt(e.clientX, e.currentTarget))}
            onPointerDown={(e) => setActive(indexAt(e.clientX, e.currentTarget))}
            onPointerLeave={() => setActive(null)}
          >
            <Axis ticks={ticks} y={y} left={MARGIN.left} right={MARGIN.left + plotWidth} labels={labels} x={center} height={height} />
            {buckets.map((_, i) => {
              const x = center(i) - barWidth / 2;
              const segments = series
                .map((s) => ({ s, v: s.values[i] ?? 0 }))
                .filter((seg) => seg.v > 0);
              let base = 0;
              return (
                <g key={i} opacity={active === null || active === i ? 1 : 0.45}>
                  {segments.map(({ s, v }, k) => {
                    const y0 = y(base);
                    const y1 = y(base + v);
                    base += v;
                    const isTop = k === segments.length - 1;
                    // A 2px surface gap separates each segment from the one above it.
                    const h = Math.max(0.5, y0 - y1 - (isTop ? 0 : 2));
                    return isTop ? (
                      <path key={s.name} d={roundedTop(x, y0 - h, barWidth, h)} fill={s.color} />
                    ) : (
                      <rect key={s.name} x={x} y={y0 - h} width={barWidth} height={h} fill={s.color} />
                    );
                  })}
                </g>
              );
            })}
          </svg>
        )}
        {!hasData && width > 0 && (
          <p className="absolute inset-x-0 top-1/3 text-center text-sm text-muted-foreground">{empty}</p>
        )}
        {active !== null && width > 0 && hasData && (
          <Tooltip
            x={center(active)}
            width={width}
            title={buckets[active].full}
            rows={[
              ...[...series].reverse().map((s) => ({ name: s.name, value: s.values[active] ?? 0, color: s.color, key: 'rect' as const })),
              { name: 'Total', value: totals[active] },
            ]}
          />
        )}
      </div>
      <ChartTable
        caption={label}
        columns={['', ...series.map((s) => s.name), 'Total']}
        rows={buckets.map((b, i) => [b.full, ...series.map((s) => s.values[i] ?? 0), totals[i]])}
      />
    </div>
  );
}
