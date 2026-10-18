import { describe, expect, it } from 'vitest';
import { getStore } from './data';
import { monthlyTrend } from './metrics';
import { parseRange } from './range';
import { formatSpan, overallMultiple, targetMultiples, targetNoteText, targetRealism } from './targets';
import type { MonthPoint } from './metrics';

const store = getStore();
const all = parseRange({}, store.months);
const groupPoints = monthlyTrend(store, {}, all);

function point(units: number, targetUnits: number | null, month = '2025-01'): MonthPoint {
  return { month, units, targetUnits, revenue: units, targetRevenue: targetUnits, leads: 0 };
}

describe('targetMultiples', () => {
  it('gives the group about 9× overall and 4–12× month by month', () => {
    const m = targetMultiples(groupPoints);
    expect(Math.round(m.overall ?? 0)).toBe(9);
    expect(m.monthly).toEqual([4, 12]);
    expect(m.offScale).toBe(true);
  });

  it('ignores months without deliveries in the monthly range and handles no targets', () => {
    const m = targetMultiples([point(0, 100), point(10, 50), point(20, 60)]);
    expect(m.monthly).toEqual([3, 5]);
    expect(targetMultiples([point(5, null), point(6, null)]).overall).toBeNull();
    expect(overallMultiple(100, 0)).toBeNull();
    expect(formatSpan([4, 4])).toBe('4');
  });
});

describe('targetRealism', () => {
  it('matches the agreed group figures', () => {
    const r = targetRealism(store, {}, all, groupPoints);
    expect(r.multiple).toBe(9);
    expect(r.bestBranch?.name).toMatch(/^Eastside/);
    expect(Math.round((r.bestBranch?.attainment ?? 0) * 100)).toBe(15);
    expect(Math.round(r.ceiling * 100)).toBe(36);
    expect(r.show).toBe(true);
  });

  it('builds the final note copy from the same multiples as the trend caption', () => {
    const r = targetRealism(store, {}, all, groupPoints);
    const m = targetMultiples(groupPoints);
    const text = targetNoteText(r);
    expect(text).toBe(
      `Targets are about 9× what the group delivers overall (${formatSpan(m.monthly!)}× month by month). ` +
        `Even the best branch, ${r.bestBranch!.name}, reached 15%, and converting every lead would only reach 36% of target. ` +
        'Treat attainment as a relative ranking until targets are confirmed.',
    );
  });

  it('is hidden for a rep, and when the multiple is below 2', () => {
    const rep = store.reps.find((x) => x.role === 'sales_officer')!;
    const repPoints = monthlyTrend(store, { repId: rep.id }, all);
    expect(targetNoteText(targetRealism(store, { repId: rep.id }, all, repPoints))).toBeNull();
    const plausible = { ...targetRealism(store, {}, all, groupPoints), multiple: 1, show: false };
    expect(targetNoteText(plausible)).toBeNull();
  });
});
