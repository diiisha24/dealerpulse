'use client';

import clsx from 'clsx';
import { useEffect, useRef, useState } from 'react';
import { Bar, CartesianGrid, ComposedChart, LabelList, Line, Tooltip, XAxis, YAxis } from 'recharts';
import { formatCrShort, formatInr, formatMonth } from '@/lib/format';
import type { MonthPoint } from '@/lib/metrics';
import { formatSpan, targetMultiples } from '@/lib/targetMultiples';
import { EmptyState } from './Section';

type Metric = 'units' | 'revenue';

const COLORS = { actual: '#1f4fd1', target: '#3d4a63', grid: '#e2e6ee', axis: '#6b768c', ink: '#14213d' };
const HEIGHT = 256;
/** Minimum px per bar before value labels are drawn on top of the bars. */
const MIN_PX_PER_LABEL = 44;
const TARGET_LABEL = 'Target (as set)';

/** Width of an element, kept current with ResizeObserver. 0 until first measured. */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    setWidth(el.getBoundingClientRect().width);
    const observer = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w !== undefined) setWidth(w);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, Math.floor(width)] as const;
}

/**
 * Axis ticks from 0 to a "nice" top (steps of 1, 2 or 5 × 10^k, about 4 intervals).
 * The top is at most max + step and step ≤ 0.625 × max, so the tallest value fills ≥ 61% of the plot.
 */
function niceTicks(max: number, integer: boolean): number[] {
  if (!(max > 0)) return [0, 1];
  const raw = max / 4;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  let step = [1, 2, 5, 10].map((m) => m * magnitude).find((s) => s >= raw) ?? 10 * magnitude;
  if (integer) step = Math.max(1, Math.ceil(step));
  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= top + step / 2; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  return ticks;
}

export function TrendChart({ points, hasTarget }: { points: MonthPoint[]; hasTarget: boolean }) {
  const [metric, setMetric] = useState<Metric>('units');
  const [boxRef, width] = useWidth<HTMLDivElement>();

  const data = points.map((p) => ({
    month: formatMonth(p.month, true),
    actual: metric === 'units' ? p.units : p.revenue,
    target: metric === 'units' ? p.targetUnits : p.targetRevenue,
  }));

  const format = (v: number) => (metric === 'units' ? `${v}` : formatCrShort(v));
  const formatTip = (v: number) => (metric === 'units' ? `${v} units` : formatInr(v));

  // Same helper as the target note, so the caption and the note always quote the same multiples.
  const m = targetMultiples(points, metric);
  const showTargets = hasTarget && m.targetSpan !== null;
  const offScale = showTargets && m.offScale;
  const drawTarget = showTargets && !offScale;

  const ticks = niceTicks(drawTarget ? Math.max(m.maxActual, m.maxTarget) : m.maxActual, metric === 'units');
  const top = ticks[ticks.length - 1] ?? 1;

  let caption: string | null = null;
  if (offScale && m.targetSpan) {
    const targetText =
      metric === 'units'
        ? `${formatSpan(m.targetSpan)} units`
        : `INR ${formatSpan(m.targetSpan, (v) => formatCrShort(v).replace(' Cr', ''))} Cr`;
    caption = m.monthly
      ? `Monthly target ${targetText}, about ${formatSpan(m.monthly)}× actual (off scale)`
      : `Monthly target ${targetText} (off scale)`;
  }

  const lastIndex = data.length - 1;
  const showBarLabels = width > 0 && data.length > 0 && width / data.length >= MIN_PX_PER_LABEL;

  if (points.length < 2) {
    return <EmptyState title="Pick two or more months to see a trend" />;
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div role="group" aria-label="Chart metric" className="inline-flex rounded-lg border border-line p-0.5">
          {(['units', 'revenue'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMetric(m)}
              aria-pressed={metric === m}
              className={clsx(
                'rounded-md px-2.5 py-1 text-[13px] font-medium capitalize transition',
                metric === m ? 'bg-ink text-white' : 'text-ink-soft hover:bg-canvas',
              )}
            >
              {m}
            </button>
          ))}
        </div>
        <p className="flex items-center gap-1.5 text-[12px] text-ink-muted">
          <span aria-hidden="true" className="inline-block h-2.5 w-2.5 rounded-sm bg-brand" />
          {metric === 'units' ? 'Units delivered' : 'Revenue delivered'}
        </p>
      </div>
      <div
        ref={boxRef}
        className="h-64 w-full min-w-0"
        role="img"
        aria-label={`Monthly ${metric} delivered${drawTarget ? ' against target' : ''}${caption ? `. ${caption}` : ''}`}
      >
        {width === 0 ? (
          <div className="h-full animate-pulse rounded-lg bg-canvas" />
        ) : (
          <ComposedChart width={width} height={HEIGHT} data={data} margin={{ top: 20, right: 8, bottom: 0, left: -8 }}>
            <CartesianGrid stroke={COLORS.grid} vertical={false} />
            <XAxis dataKey="month" tick={{ fill: COLORS.axis, fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis
              tickFormatter={format}
              tick={{ fill: COLORS.axis, fontSize: 12 }}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
              domain={[0, top]}
              ticks={ticks}
              width={metric === 'units' ? 40 : 56}
            />
            <Tooltip
              cursor={{ fill: 'rgba(31, 79, 209, 0.06)' }}
              formatter={(value: number, name: string) => [
                formatTip(value),
                name === 'actual' ? 'Delivered' : TARGET_LABEL,
              ]}
              contentStyle={{ borderRadius: 8, borderColor: COLORS.grid, fontSize: 13 }}
            />
            <Bar dataKey="actual" fill={COLORS.actual} radius={[4, 4, 0, 0]} maxBarSize={42} isAnimationActive={false}>
              {showBarLabels && (
                <LabelList
                  dataKey="actual"
                  position="top"
                  formatter={format}
                  style={{ fill: COLORS.ink, fontSize: 11, fontWeight: 600 }}
                />
              )}
            </Bar>
            {drawTarget && (
              <Line
                dataKey="target"
                stroke={COLORS.target}
                strokeDasharray="5 4"
                strokeWidth={2}
                dot={{ r: 3, fill: COLORS.target }}
                type="monotone"
                isAnimationActive={false}
              >
                <LabelList
                  dataKey="target"
                  content={(props) => {
                    const { x, y, index } = props as { x?: number | string; y?: number | string; index?: number };
                    if (index !== lastIndex || x === undefined || y === undefined) return null;
                    return (
                      <text x={Number(x)} y={Number(y) - 8} textAnchor="end" fill={COLORS.target} fontSize={11} fontWeight={600}>
                        {TARGET_LABEL}
                      </text>
                    );
                  }}
                />
              </Line>
            )}
          </ComposedChart>
        )}
      </div>
      {caption && <p className="mt-2 text-[12px] text-ink-muted">{caption}</p>}
    </div>
  );
}
