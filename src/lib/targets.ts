import type { DataStore } from './data';
import { formatPct } from './format';
import { type MonthPoint, type Scope, branchRows, ratio, summarize } from './metrics';
import { NOTE_MIN_MULTIPLE, formatSpan, targetMultiples } from './targetMultiples';
import type { MonthRange } from './types';

/** Target realism for the target note. The multiples come from `targetMultiples`, shared with the trend chart. */
export {
  NOTE_MIN_MULTIPLE,
  OFF_SCALE_MULTIPLE,
  formatSpan,
  overallMultiple,
  targetMultiples,
  type TargetMetric,
  type TargetMultiples,
} from './targetMultiples';

export interface TargetRealism {
  /** Overall unit multiple, rounded for copy. */
  multiple: number;
  monthly: [number, number] | null;
  bestBranch: { id: string; name: string; attainment: number } | null;
  /** Leads created in the period ÷ unit target: attainment if every lead became a delivery. */
  ceiling: number;
  /** Whether the note should be shown. */
  show: boolean;
}

/** Unit-target realism for a scope and range. Reps have no targets, so they always get `show: false`. */
export function targetRealism(
  store: DataStore,
  scope: Scope,
  range: MonthRange,
  points: MonthPoint[],
): TargetRealism {
  const m = targetMultiples(points, 'units');
  const s = summarize(store, scope, range);
  const branches = branchRows(store, range).filter((b) => Number.isFinite(b.summary.unitAttainment));
  const best = branches.reduce<(typeof branches)[number] | null>(
    (a, b) => (a === null || b.summary.unitAttainment > a.summary.unitAttainment ? b : a),
    null,
  );
  const multiple = m.overall === null ? NaN : Math.round(m.overall);
  return {
    multiple,
    monthly: m.monthly,
    bestBranch: best ? { id: best.branchId, name: best.name, attainment: best.summary.unitAttainment } : null,
    ceiling: s.targetUnits ? ratio(s.leads, s.targetUnits) : NaN,
    show: !scope.repId && s.targetUnits !== null && s.targetUnits > 0 && Number.isFinite(multiple) && multiple >= NOTE_MIN_MULTIPLE,
  };
}

/**
 * The target note (wording fixed by the EM, 18 Oct 2026). `subject` is "the group" on the overview
 * and the branch name on a branch page. Returns null when the note should be hidden.
 */
export function targetNoteText(r: TargetRealism, subject = 'the group'): string | null {
  if (!r.show || !r.bestBranch || !Number.isFinite(r.ceiling)) return null;
  const monthly = r.monthly && r.monthly[0] !== r.monthly[1] ? ` (${formatSpan(r.monthly)}× month by month)` : '';
  return (
    `Targets are about ${r.multiple}× what ${subject} delivers overall${monthly}. ` +
    `Even the best branch, ${r.bestBranch.name}, reached ${formatPct(r.bestBranch.attainment)}, ` +
    `and converting every lead would only reach ${formatPct(r.ceiling)} of target. ` +
    'Treat attainment as a relative ranking until targets are confirmed.'
  );
}
