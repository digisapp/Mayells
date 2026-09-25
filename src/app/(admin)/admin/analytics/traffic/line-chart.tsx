'use client';

import { useState } from 'react';
import { Axis, ChartTable, Legend, MARGIN, Tooltip, countTicks, labelIndices, useKeyboardIndex, useWidth } from './chart-parts';

export interface LineSeries {
  name: string;
  color: string;
  values: number[];
}

interface Props {
  buckets: Array<{ label: string; full: string }>;
  series: LineSeries[];
  /** Shown in the readout and the table but not drawn. */
  extras?: Array<{ name: string; values: number[] }>;
  label: string;
  /** What one bucket is, for the keyboard hint. */
  unit: 'hour' | 'day';
  height?: number;
}

/** Lines over time on one count axis, with a crosshair readout that snaps to the nearest bucket. */
export function LineChart({ buckets, series, extras = [], label, unit, height = 240 }: Props) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const count = buckets.length;

  // Room on the right for the end-of-line values.
  const margin = { ...MARGIN, right: 48 };
  const plotWidth = Math.max(0, width - margin.left - margin.right);
  const plotHeight = height - margin.top - margin.bottom;
  const ticks = countTicks(Math.max(0, ...series.flatMap((s) => s.values)));
  const top = ticks[ticks.length - 1];
  const x = (i: number) => margin.left + (count <= 1 ? plotWidth / 2 : (i / (count - 1)) * plotWidth);
  const y = (v: number) => margin.top + plotHeight - (v / top) * plotHeight;
  const labels = [...labelIndices(count, plotWidth)].map((i) => ({ i, text: buckets[i].label }));

  function indexAt(clientX: number, target: Element) {
    const px = clientX - target.getBoundingClientRect().left;
    const raw = count <= 1 ? 0 : Math.round(((px - margin.left) / plotWidth) * (count - 1));
    return Math.min(count - 1, Math.max(0, raw));
  }

  // Direct labels at the line ends, unless they would sit on top of each other.
  const last = count - 1;
  const ends = series.map((s) => ({ s, y: y(s.values[last] ?? 0) }));
  const endsClash = ends.some((a, i) => ends.some((b, j) => i < j && Math.abs(a.y - b.y) < 14));

  const keyboard = useKeyboardIndex(count, setActive);

  return (
    <div>
      <Legend kind="line" items={series} />
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
            <Axis ticks={ticks} y={y} left={margin.left} right={margin.left + plotWidth} labels={labels} x={x} height={height} />
            {series.map((s) => (
              <path
                key={s.name}
                d={s.values.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${y(v)}`).join('')}
                fill="none"
                stroke={s.color}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ))}
            {series.map((s) => (
              <circle key={s.name} cx={x(last)} cy={y(s.values[last] ?? 0)} r={4} fill={s.color} stroke="var(--card)" strokeWidth={2} />
            ))}
            {!endsClash &&
              ends.map(({ s, y: ey }) => (
                <text key={s.name} x={x(last) + 9} y={ey} dominantBaseline="middle" className="fill-foreground text-[11px] font-medium tabular-nums">
                  {(s.values[last] ?? 0).toLocaleString()}
                </text>
              ))}
            {active !== null && (
              <g aria-hidden>
                <line x1={x(active)} x2={x(active)} y1={margin.top} y2={margin.top + plotHeight} stroke="var(--muted-foreground)" strokeOpacity={0.5} />
                {series.map((s) => (
                  <circle key={s.name} cx={x(active)} cy={y(s.values[active] ?? 0)} r={4.5} fill={s.color} stroke="var(--card)" strokeWidth={2} />
                ))}
              </g>
            )}
          </svg>
        )}
        {active !== null && width > 0 && (
          <Tooltip
            x={x(active)}
            width={width}
            title={buckets[active].full}
            rows={[
              ...series.map((s) => ({ name: s.name, value: s.values[active] ?? 0, color: s.color })),
              ...extras.map((e) => ({ name: e.name, value: e.values[active] ?? 0 })),
            ]}
          />
        )}
      </div>
      <ChartTable
        caption={label}
        columns={['', ...series.map((s) => s.name), ...extras.map((e) => e.name)]}
        rows={buckets.map((b, i) => [b.full, ...series.map((s) => s.values[i] ?? 0), ...extras.map((e) => e.values[i] ?? 0)])}
      />
    </div>
  );
}
