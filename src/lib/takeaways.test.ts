import { describe, expect, it } from 'vitest';
import { getStore } from './data';
import {
  cohort,
  delayReasons,
  funnel,
  lostReasons,
  monthlyTrend,
  scopedDeliveries,
  sourcePerformance,
  type CountRow,
  type MonthPoint,
} from './metrics';
import { inRange, parseRange } from './range';
import {
  MAX_TITLE,
  delayTakeaway,
  funnelTakeaway,
  lostTakeaway,
  sourceTakeaway,
  trendTakeaway,
} from './takeaways';

const store = getStore();
const all = parseRange({}, store.months);
const leads = cohort(store, {}, all);

describe('takeaways on the full dataset', () => {
  it('names the best month and its gap to target', () => {
    const t = trendTakeaway(monthlyTrend(store, {}, all));
    expect(t.kicker).toBe('Deliveries vs target');
    expect(t.title).toMatch(/^Dec 2025 was the best month \(52 units\), still \d+× below its target$/);
  });

  it('names the biggest funnel drop', () => {
    const t = funnelTakeaway(funnel(leads));
    expect(t.title).toMatch(/^Biggest drop is .+ → .+: \d+% stop there$/);
    expect(t.kicker).toBe('Sales funnel');
  });

  it('compares the best and worst source', () => {
    const t = sourceTakeaway(sourcePerformance(leads));
    expect(t.title).toMatch(/convert at \d+%/);
  });

  it('keeps every title within the length limit, for every branch and month', () => {
    const scopes = [{}, ...store.branches.map((b) => ({ branchId: b.id }))];
    const ranges = [all, ...store.months.map((m) => parseRange({ from: m, to: m }, store.months))];
    for (const scope of scopes) {
      for (const range of ranges) {
        const ls = cohort(store, scope, range);
        const ds = scopedDeliveries(store, scope).filter((d) => inRange(d.deliveryMonth, range));
        const titles = [
          trendTakeaway(monthlyTrend(store, scope, range)),
          funnelTakeaway(funnel(ls)),
          lostTakeaway(lostReasons(ls)),
          delayTakeaway(delayReasons(ds)),
          sourceTakeaway(sourcePerformance(ls)),
        ];
        for (const t of titles) {
          expect(t.title.length).toBeLessThanOrEqual(MAX_TITLE);
          expect(t.title).not.toMatch(/NaN|Infinity|undefined|–/);
        }
      }
    }
  });
});

describe('takeaway fallbacks', () => {
  const p = (month: string, units: number, targetUnits: number | null): MonthPoint => ({
    month,
    units,
    targetUnits,
    revenue: 0,
    targetRevenue: null,
    leads: 0,
  });

  it('falls back to the noun when n is below 10', () => {
    expect(trendTakeaway([p('2025-01', 3, 10), p('2025-02', 4, 10)])).toEqual({ title: 'Deliveries vs target' });
    expect(lostTakeaway([{ label: 'Price', count: 4, share: 1 }])).toEqual({ title: 'Why leads are lost' });
    expect(funnelTakeaway([])).toEqual({ title: 'Sales funnel' });
    expect(sourceTakeaway([])).toEqual({ title: 'Lead sources' });
  });

  it('ignores funnel steps out of a stage with fewer than 10 leads', () => {
    const step = (stage: 'new' | 'contacted' | 'test_drive', count: number, fromPrevious: number) => ({
      stage,
      count,
      ofTotal: 0,
      fromPrevious,
      lostHere: 0,
    });
    const t = funnelTakeaway([step('new', 40, 1), step('contacted', 6, 0.15), step('test_drive', 0, 0)]);
    expect(t.title).toBe('Biggest drop is New → Contacted: 85% stop there');
  });

  it('falls back on a single month or a tie for best month', () => {
    expect(trendTakeaway([p('2025-01', 30, 100)])).toEqual({ title: 'Deliveries vs target' });
    expect(trendTakeaway([p('2025-01', 30, 100), p('2025-02', 30, 100)])).toEqual({ title: 'Deliveries vs target' });
  });

  it('reads ties as "A and B (n each)" and handles unrecorded reasons', () => {
    const rows: CountRow[] = [
      { label: 'Price', count: 6, share: 0.5 },
      { label: 'Finance', count: 6, share: 0.5 },
    ];
    expect(lostTakeaway(rows).title).toBe('Price and Finance are the top reasons leads are lost (6 each)');
    expect(lostTakeaway([{ label: 'Not recorded', count: 12, share: 1 }]).title).toBe(
      'Most lost leads have no reason recorded (100%)',
    );
  });

  it('says when a target was met', () => {
    expect(trendTakeaway([p('2025-01', 5, 5), p('2025-02', 12, 10)]).title).toBe(
      'Feb 2025 was the best month (12 units) and met its target',
    );
  });
});
