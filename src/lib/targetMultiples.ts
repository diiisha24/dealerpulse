import type { MonthPoint } from './metrics';

/**
 * How far the targets sit from what is actually delivered. Pure (type-only imports) so client charts can use it without bundling the dataset. One helper feeds the trend-chart
 * caption and the target note, so the two always quote the same multiples.
 */

export type TargetMetric = 'units' | 'revenue';

/** Above this target ÷ actual multiple a target line would flatten the bars, so charts drop it. */
export const OFF_SCALE_MULTIPLE = 3;
/** Below this overall multiple targets look plausible and the target note is hidden. */
export const NOTE_MIN_MULTIPLE = 2;

export interface TargetMultiples {
  /** Total target ÷ total delivered over the months. null without targets or deliveries. */
  overall: number | null;
  /** Lowest and highest whole-number monthly multiple, over months with a target and deliveries. */
  monthly: [number, number] | null;
  /** Lowest and highest monthly target (months with a target above 0). */
  targetSpan: [number, number] | null;
  maxActual: number;
  maxTarget: number;
  /** True when the highest target is more than OFF_SCALE_MULTIPLE × the highest actual. */
  offScale: boolean;
}

/** Target ÷ actual, or null when either side is missing or zero. Used by the KPI hint, the chart and the note. */
export function overallMultiple(target: number | null, actual: number): number | null {
  if (target === null || !(target > 0) || !(actual > 0)) return null;
  return target / actual;
}

function minMax(values: number[]): [number, number] | null {
  if (values.length === 0) return null;
  return [Math.min(...values), Math.max(...values)];
}

/** Target-to-actual multiples for a monthly series. */
export function targetMultiples(points: MonthPoint[], metric: TargetMetric = 'units'): TargetMultiples {
  const rows = points.map((p) => ({
    actual: metric === 'units' ? p.units : p.revenue,
    target: metric === 'units' ? p.targetUnits : p.targetRevenue,
  }));
  const withTarget = rows.filter((r): r is { actual: number; target: number } => r.target !== null && r.target > 0);
  const totalTarget = withTarget.reduce((s, r) => s + r.target, 0);
  const totalActual = withTarget.reduce((s, r) => s + r.actual, 0);
  const maxActual = Math.max(0, ...rows.map((r) => r.actual));
  const maxTarget = Math.max(0, ...withTarget.map((r) => r.target));
  return {
    overall: withTarget.length > 0 ? overallMultiple(totalTarget, totalActual) : null,
    monthly: minMax(withTarget.filter((r) => r.actual > 0).map((r) => Math.round(r.target / r.actual))),
    targetSpan: minMax(withTarget.map((r) => r.target)),
    maxActual,
    maxTarget,
    offScale: withTarget.length > 0 && maxTarget > OFF_SCALE_MULTIPLE * maxActual,
  };
}

/** "4–12" or "9" when both ends match. */
export function formatSpan([lo, hi]: [number, number], fmt: (v: number) => string = String): string {
  return lo === hi ? fmt(lo) : `${fmt(lo)}–${fmt(hi)}`;
}
