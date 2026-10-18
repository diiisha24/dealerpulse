import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getStore } from './data';
import { maskPhone, formatInr, formatDate } from './format';
import { KIND_LABEL, buildAlerts } from './insights';
import { buildBriefing } from './narrative';
import { toLeadRows } from './leadRows';
import {
  NOT_RECORDED,
  bookingAges,
  cohort,
  contactSpeedBuckets,
  funnel,
  isColdLead,
  lostReasons,
  neverContactedBreakdown,
  pastPromised,
  repConversionFlags,
  repRows,
  slowestDeliveryDays,
  summarize,
  whatIfBase,
} from './metrics';
import { parseRange } from './range';
import { simulate } from './whatif';
import { toCsv } from './csv';

const store = getStore();
const all = parseRange({}, store.months);

describe('data store', () => {
  it('covers June to December 2025 and anchors "today" to the last record', () => {
    expect(store.months[0]).toBe('2025-06');
    expect(store.months[store.months.length - 1]).toBe('2025-12');
    expect(store.asOf.startsWith('2025-12-31')).toBe(true);
  });

  it('attributes every delivery to a branch', () => {
    expect(store.deliveries).toHaveLength(160);
    expect(store.deliveries.every((d) => store.branchById.has(d.branchId))).toBe(true);
  });

  it('flags leads closed as lost without a record', () => {
    expect(store.leads.filter((l) => l.lostWithoutRecord)).toHaveLength(14);
  });
});

describe('summarize', () => {
  it('totals group deliveries and revenue against target', () => {
    const s = summarize(store, {}, all);
    expect(s.units).toBe(160);
    expect(s.leads).toBe(510);
    expect(s.targetUnits).toBe(1426);
    expect(s.unitAttainment).toBeCloseTo(160 / 1426, 5);
  });

  it('has no target for a single rep', () => {
    const s = summarize(store, { repId: 'SR2' }, all);
    expect(s.targetUnits).toBeNull();
    expect(Number.isNaN(s.unitAttainment)).toBe(true);
  });

  it('branch totals add up to the group', () => {
    const sum = store.branches.reduce((acc, b) => acc + summarize(store, { branchId: b.id }, all).units, 0);
    expect(sum).toBe(160);
  });
});

describe('funnel', () => {
  it('is monotonically non-increasing and starts at the cohort size', () => {
    const steps = funnel(cohort(store, {}, all));
    expect(steps[0]!.count).toBe(510);
    for (let i = 1; i < steps.length; i += 1) {
      expect(steps[i]!.count).toBeLessThanOrEqual(steps[i - 1]!.count);
    }
    expect(steps[steps.length - 1]!.count).toBe(160);
  });
});

describe('range parsing', () => {
  it('falls back to the full range for bad input', () => {
    expect(parseRange({ from: 'abc', to: '2030-01' }, store.months)).toEqual(all);
  });

  it('swaps reversed ranges', () => {
    expect(parseRange({ from: '2025-10', to: '2025-07' }, store.months)).toEqual({ from: '2025-07', to: '2025-10' });
  });
});

describe('alerts and briefing', () => {
  it('surfaces critical alerts first', () => {
    const alerts = buildAlerts(store, all);
    expect(alerts.length).toBeGreaterThan(0);
    expect(alerts[0]!.severity).toBe('critical');
    expect(alerts.some((a) => a.kind === 'stuck_orders')).toBe(true);
  });

  it('flags Lakeside as an outlier', () => {
    const alerts = buildAlerts(store, all);
    expect(alerts.some((a) => a.branchId === 'B3' && a.kind === 'loss_anomaly')).toBe(true);
  });

  it('writes a headline for every scope', () => {
    const alerts = buildAlerts(store, all);
    expect(buildBriefing(store, {}, all, alerts).headline).toMatch(/group delivered 160 cars/);
    expect(buildBriefing(store, { branchId: 'B3' }, all, []).headline).toMatch(/Lakeside/);
  });
});

describe('W2 status unclear', () => {
  const unclear = store.leads.filter((l) => l.statusUnclear);

  it('finds 14 leads marked lost with no lost step, counted as open at their last stage', () => {
    expect(unclear).toHaveLength(14);
    expect(unclear.every((l) => l.isOpen && !l.isLost && l.effectiveStatus !== 'lost')).toBe(true);
    expect(unclear.every((l) => l.lostAtStage === null)).toBe(true);
    expect(store.leadById.get('L0481')?.effectiveStatus).toBe('negotiation');
  });

  it('drops the all-months loss rate to 54% and keeps them out of lost reasons', () => {
    const s = summarize(store, {}, all);
    expect(Math.round(s.lossRate * 100)).toBe(54);
    expect(s.statusUnclear).toBe(14);
    expect(lostReasons(cohort(store, {}, all)).some((r) => r.label === NOT_RECORDED)).toBe(false);
  });

  it('counts 9 cold leads and puts the unclear leads in the open pipeline', () => {
    const s = summarize(store, {}, all);
    expect(s.coldLeads).toBe(9);
    expect(s.openLeads).toBe(38);
    expect(s.openPipelineValue).toBe(97_660_000);
  });

  it('raises a status_unclear warning with the agreed copy', () => {
    const alerts = buildAlerts(store, all);
    const parts = alerts.filter((a) => a.kind === 'status_unclear');
    expect(parts.reduce((s, a) => s + a.leads.length, 0)).toBe(14);
    expect(parts.every((a) => a.severity === 'warning')).toBe(true);
    expect(parts[0]!.action).toBe('Ask each rep to confirm: reopen and follow up, or record the loss reason.');
    const rolled = buildAlerts(store, all, {}, { rollUpBranches: true }).filter((a) => a.kind === 'status_unclear');
    expect(rolled).toHaveLength(1);
    expect(rolled[0]!.title).toBe('14 leads marked lost with no loss recorded — confirm status');
    expect(KIND_LABEL.status_unclear).toBe('Status unclear');
  });

  it('no longer says Lakeside loses 100% in December', () => {
    const dec = { from: '2025-12', to: '2025-12' };
    expect(buildAlerts(store, dec).some((a) => a.kind === 'loss_anomaly' && a.title.includes('100%'))).toBe(false);
  });

  it('shows unclear leads at their last stage in lead rows', () => {
    const rows = toLeadRows(store, unclear);
    expect(rows.every((r) => r.statusUnclear && r.status !== 'lost')).toBe(true);
  });
});

describe('W3 stuck-order split', () => {
  it('computes slowest delivery, booking ages and past-promised bookings', () => {
    expect(slowestDeliveryDays(store)).toBe(39);
    const buckets = bookingAges(store, {});
    expect(buckets.map((b) => b.count)).toEqual([14, 9, 4, 11]);
    expect(buckets.reduce((s, b) => s + b.count, 0)).toBe(38);
    const late = pastPromised(store, {});
    expect([late.count, late.total]).toEqual([30, 38]);
    expect(late.value).toBe(67_980_000);
  });

  it('splits 24 stuck orders into 23 likely cancelled and 1 chase delivery', () => {
    const alerts = buildAlerts(store, all);
    const verify = alerts.filter((a) => a.kind === 'stuck_verify');
    const chase = alerts.filter((a) => a.kind === 'stuck_orders');
    const count = (list: typeof alerts) => list.reduce((s, a) => s + a.leads.length, 0);
    expect([count(verify), count(chase)]).toEqual([23, 1]);
    expect(verify.every((a) => a.severity === 'warning')).toBe(true);
    const value = [...verify, ...chase].flatMap((a) => a.leads).reduce((s, l) => s + l.value, 0);
    expect(value).toBe(summarize(store, {}, all).stuckOrderValue);
    expect(formatInr(value)).toBe('INR 5.5 Cr');
    expect([...verify, ...chase].every((a) => a.leads.every((l) => typeof l.promised === 'string'))).toBe(true);
    expect([...verify, ...chase].every((a) => /promised date/.test(a.detail) && /Bookings by age/.test(a.detail))).toBe(
      true,
    );
    expect(KIND_LABEL.stuck_verify).toBe('Likely cancelled');
  });

  it('shows at most 2 stuck cards on the overview', () => {
    const rolled = buildAlerts(store, all, {}, { rollUpBranches: true });
    expect(rolled.filter((a) => a.kind === 'stuck_orders' || a.kind === 'stuck_verify').length).toBeLessThanOrEqual(2);
  });
});

describe('W4 never contacted and contact speed', () => {
  it('finds 119 leads never contacted, none of which reached an order', () => {
    const buckets = contactSpeedBuckets(cohort(store, {}, all));
    expect(buckets[0]).toMatchObject({ label: 'Never', leads: 119, orders: 0 });
    expect(buckets.map((b) => b.leads)).toEqual([119, 45, 160, 161, 25]);
  });

  it('splits never-contacted leads into a call card (open) and a process card (closed)', () => {
    const alerts = buildAlerts(store, all);
    // All months: the 5 leads still "new" are under 48 h old, so there is no call card.
    expect(alerts.filter((a) => a.kind === 'never_contacted')).toHaveLength(0);
    const proc = alerts.filter((a) => a.kind === 'never_contacted_process');
    const byBranch = Object.fromEntries(proc.map((a) => [a.branchId, a.leads.length]));
    expect(byBranch).toEqual({ B1: 17, B2: 20, B3: 31, B4: 17, B5: 27 });
    expect(proc.reduce((s, a) => s + a.leads.length, 0)).toBe(summarize(store, {}, all).closedWithoutCall);
    expect(proc.every((a) => a.severity === 'warning')).toBe(true);
    expect(proc.every((a) => a.action === 'Set a same-day first-call rule and review how new leads are assigned.')).toBe(
      true,
    );
    const lakeside = proc.find((a) => a.branchId === 'B3')!;
    expect(lakeside.title).toBe('Lakeside Toyota never called 42% of its leads');
    expect(lakeside.detail).toMatch(/against 20% at other branches/);
    expect(proc.find((a) => a.branchId === 'B1')!.title).toMatch(/^17 leads in .+ were closed without a first call$/);
    const rolled = buildAlerts(store, all, {}, { rollUpBranches: true }).find(
      (a) => a.kind === 'never_contacted_process',
    )!;
    expect(rolled.detail).toMatch(/Of 119 leads never contacted, 0 reached an order\./);
    expect(KIND_LABEL.never_contacted).toBe('Never contacted');
    expect(KIND_LABEL.never_contacted_process).toBeTruthy();
  });

  it('puts each of the 119 never-contacted leads in exactly one bucket', () => {
    const b = neverContactedBreakdown(store, cohort(store, {}, all));
    const buckets = [b.openActionable, b.openFresh, b.statusUnclear, b.closed];
    expect(b.total).toBe(119);
    expect(buckets.map((x) => x.length)).toEqual([0, 5, 2, 112]);
    expect(buckets.reduce((s, x) => s + x.length, 0)).toBe(b.total);
    const ids = buckets.flat().map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(b.statusUnclear.map((l) => l.id).sort()).toEqual(['L0493', 'L0498']);
    // The alerts carry exactly the actionable and closed buckets.
    const carried = buildAlerts(store, all)
      .filter((a) => a.kind === 'never_contacted' || a.kind === 'never_contacted_process')
      .reduce((s, a) => s + a.leads.length, 0);
    expect(carried).toBe(b.openActionable.length + b.closed.length);
  });

  it('exposes unambiguous never-contacted fields on Summary', () => {
    const s = summarize(store, {}, all);
    expect(s.neverContactedTotal).toBe(119);
    expect(s.neverContactedOverdue).toBe(0);
    expect(s.closedWithoutCall).toBe(112);
    expect(s.neverContacted).toBe(s.closedWithoutCall);
    for (const b of store.branches) {
      const bs = summarize(store, { branchId: b.id }, all);
      expect(bs.neverContactedOverdue + bs.closedWithoutCall).toBeLessThanOrEqual(bs.neverContactedTotal);
    }
  });

  it('keeps status "new" out of the cold count', () => {
    expect(store.leads.filter((l) => isColdLead(l)).every((l) => l.effectiveStatus !== 'new')).toBe(true);
    expect(summarize(store, {}, all).coldLeads).toBe(9);
  });

  it('drops slow_response to info and removes the "another dealer" copy', () => {
    const slow = buildAlerts(store, all).filter((a) => a.kind === 'slow_response');
    expect(slow.every((a) => a.severity === 'info' && !/another dealer/.test(a.detail))).toBe(true);
  });
});

describe('W5 alert-engine consistency', () => {
  it('flags the same reps in the table and the alerts (SR13 and SR15)', () => {
    const flagged = repRows(store, undefined, all)
      .filter((r) => r.belowPeers)
      .map((r) => r.repId)
      .sort();
    expect(flagged).toEqual(expect.arrayContaining(['SR13', 'SR15']));
    const alerted = buildAlerts(store, all)
      .filter((a) => a.kind === 'rep_conversion')
      .map((a) => a.repId)
      .sort();
    expect(alerted).toEqual(flagged);
    for (const b of store.branches) {
      const perBranch = repRows(store, b.id, all).filter((r) => r.belowPeers).map((r) => r.repId);
      expect(perBranch.every((id) => flagged.includes(id))).toBe(true);
    }
  });

  it('excludes the rep from their own peers and needs enough leads', () => {
    const flags = repConversionFlags(repRows(store, undefined, all));
    for (const r of repRows(store, undefined, all)) {
      if (r.belowPeers) {
        expect(r.summary.leads).toBeGreaterThanOrEqual(8);
        expect(r.summary.conversion).toBeLessThan(r.peerConversion * 0.6);
      }
      expect(flags.get(r.repId)?.belowPeers).toBe(r.belowPeers);
    }
  });

  it('names the branch manager on branch alerts and the rep on rep alerts', () => {
    const alerts = buildAlerts(store, all);
    for (const a of alerts) {
      if (a.repId) expect(a.owner).toMatchObject({ repId: a.repId });
      else if (a.branchId) expect(a.owner?.role).toBe('branch_manager');
    }
    expect(alerts.find((a) => a.kind === 'rep_conversion')?.owner?.role).toBe('sales_officer');
    const rolled = buildAlerts(store, all, {}, { rollUpBranches: true }).filter((a) => a.id.endsWith('-group'));
    expect(rolled.every((a) => a.owner === undefined)).toBe(true);
  });
});

describe('copy rules', () => {
  it('has a label for every alert kind and no literal percentages in alert or narrative code', () => {
    const alerts = buildAlerts(store, all);
    expect(alerts.every((a) => typeof KIND_LABEL[a.kind] === 'string' && KIND_LABEL[a.kind].length > 0)).toBe(true);
    for (const file of ['insights.ts', 'narrative.ts']) {
      const src = readFileSync(join(__dirname, file), 'utf8');
      const strings = src.match(/(['`])(?:(?!\1)[^\\]|\\.)*\1/g) ?? [];
      expect(strings.filter((s) => /\d%/.test(s))).toEqual([]);
    }
  });
});

describe('what-if simulator', () => {
  it('reproduces today at zero uplift and grows with it', () => {
    const base = whatIfBase(store, {}, all);
    const today = simulate(base, 0, 0);
    expect(today.units).toBeCloseTo(base.units, 6);
    expect(Math.abs(today.extraRevenue)).toBeLessThan(1);
    expect(simulate(base, 0, 0.1).extraUnits).toBeGreaterThan(0);
  });

  it('never models a conversion rate above 100%', () => {
    const base = whatIfBase(store, {}, all);
    expect(simulate(base, 5, 5).orderRate).toBeLessThanOrEqual(1);
  });
});

describe('format', () => {
  it('masks all but the last three phone digits', () => {
    expect(maskPhone('9269820594')).toBe('•••••••594');
  });
  it('neutralises spreadsheet formulas and quotes in CSV export', () => {
    const csv = toCsv([{ v: '=HYPERLINK("x")' }, { v: 'a, b' }], [{ header: 'V', value: (r) => r.v }]);
    expect(csv).toBe('V\r\n"\'=HYPERLINK(""x"")"\r\n"a, b"');
  });
  it('formats crores and dates', () => {
    expect(formatInr(38_900_000)).toBe('INR 3.9 Cr');
    expect(formatDate('2025-12-31T19:10:00Z')).toBe('31 Dec 2025');
  });
});
