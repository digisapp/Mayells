'use client';

import { useEffect, useRef, useState } from 'react';

/** The container's width in CSS pixels, so charts draw at 1:1 instead of scaling text. */
export function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(Math.floor(el.getBoundingClientRect().width));
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

/** Ticks for a count axis: whole-number steps of 1, 2 or 5 × 10ⁿ, about four of them. */
export function countTicks(max: number, target = 4): number[] {
  if (max <= 0) return [0, 1];
  const raw = max / target;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = Math.max(1, [1, 2, 5, 10].map((m) => m * magnitude).find((s) => s >= raw)!);
  const top = step * Math.ceil(max / step);
  return Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
}

/** Which buckets get an axis label: evenly spaced, anchored on the latest. */
export function labelIndices(count: number, room: number): Set<number> {
  const max = Math.max(2, Math.floor(room / 64));
  const step = Math.max(1, Math.ceil(count / max));
  const out = new Set<number>();
  for (let i = count - 1; i >= 0; i -= step) out.add(i);
  return out;
}

export const MARGIN = { top: 12, right: 16, bottom: 26, left: 40 };

export function Axis({
  ticks,
  y,
  left,
  right,
  labels,
  x,
  height,
}: {
  ticks: number[];
  y: (v: number) => number;
  left: number;
  right: number;
  labels: Array<{ i: number; text: string }>;
  x: (i: number) => number;
  height: number;
}) {
  return (
    <g aria-hidden>
      {ticks.map((t) => (
        <g key={t}>
          <line
            x1={left}
            x2={right}
            y1={y(t)}
            y2={y(t)}
            stroke={t === 0 ? 'var(--muted-foreground)' : 'var(--border)'}
            strokeOpacity={t === 0 ? 0.35 : 1}
            shapeRendering="crispEdges"
          />
          <text x={left - 8} y={y(t)} textAnchor="end" dominantBaseline="middle" className="fill-muted-foreground text-[11px] tabular-nums">
            {t.toLocaleString()}
          </text>
        </g>
      ))}
      {labels.map(({ i, text }) => {
        // Labels near either edge anchor inward rather than overhang it.
        const px = x(i);
        const anchor = px - left < 28 ? 'start' : right - px < 28 ? 'end' : 'middle';
        return (
          <text key={i} x={px} y={height - 6} textAnchor={anchor} className="fill-muted-foreground text-[11px]">
            {text}
          </text>
        );
      })}
    </g>
  );
}

export interface TooltipRow {
  name: string;
  value: number;
  color?: string;
  /** Line key for lines, square for bars; matches the legend. */
  key?: 'line' | 'rect';
}

/** One readout for every series at the hovered position; values lead, names follow. */
export function Tooltip({ x, width, title, rows }: { x: number; width: number; title: string; rows: TooltipRow[] }) {
  const boxWidth = 184;
  const left = x + 14 + boxWidth > width ? x - 14 - boxWidth : x + 14;
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute top-1 z-10 rounded-md border bg-popover px-3 py-2 text-xs shadow-md"
      style={{ left: Math.max(0, left), width: boxWidth }}
    >
      <p className="mb-1.5 font-medium text-foreground">{title}</p>
      {rows.map((r) => (
        <div key={r.name} className="flex items-center gap-2 py-0.5">
          {r.color ? (
            r.key === 'rect' ? (
              <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ background: r.color }} />
            ) : (
              <span className="h-0.5 w-3 shrink-0 rounded-full" style={{ background: r.color }} />
            )
          ) : (
            <span className="w-3 shrink-0" />
          )}
          <span className="font-semibold tabular-nums text-foreground">{r.value.toLocaleString()}</span>
          <span className="truncate text-muted-foreground">{r.name}</span>
        </div>
      ))}
    </div>
  );
}

export function Legend({ items, kind }: { items: Array<{ name: string; color: string }>; kind: 'line' | 'rect' }) {
  return (
    <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {items.map((item) => (
        <li key={item.name} className="flex items-center gap-1.5">
          {kind === 'line' ? (
            <span className="h-0.5 w-3.5 rounded-full" style={{ background: item.color }} />
          ) : (
            <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: item.color }} />
          )}
          {item.name}
        </li>
      ))}
    </ul>
  );
}

/** Every value in the chart, reachable without hovering. */
export function ChartTable({ caption, columns, rows }: { caption: string; columns: string[]; rows: Array<Array<string | number>> }) {
  return (
    <details className="mt-3 text-xs">
      <summary className="w-fit cursor-pointer select-none text-muted-foreground hover:text-foreground">Show as table</summary>
      <div className="mt-2 max-h-72 overflow-auto rounded-md border">
        <table className="w-full">
          <caption className="sr-only">{caption}</caption>
          <thead className="sticky top-0 bg-muted">
            <tr>
              {columns.map((c, i) => (
                <th key={c} scope="col" className={`px-3 py-1.5 font-medium text-muted-foreground ${i === 0 ? 'text-left' : 'text-right'}`}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, r) => (
              <tr key={r} className="border-t">
                {row.map((cell, i) => (
                  <td key={i} className={`px-3 py-1 ${i === 0 ? 'text-left' : 'text-right tabular-nums'}`}>
                    {typeof cell === 'number' ? cell.toLocaleString() : cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

/** Arrow keys walk the buckets, so the readout works without a pointer. */
export function useKeyboardIndex(count: number, setActive: (update: (i: number | null) => number | null) => void) {
  return {
    tabIndex: 0,
    onFocus: () => setActive((i) => i ?? count - 1),
    onBlur: () => setActive(() => null),
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowLeft') setActive((i) => Math.max(0, (i ?? count) - 1));
      else if (e.key === 'ArrowRight') setActive((i) => Math.min(count - 1, (i ?? -1) + 1));
      else if (e.key === 'Escape') setActive(() => null);
      else return;
      e.preventDefault();
    },
  };
}
