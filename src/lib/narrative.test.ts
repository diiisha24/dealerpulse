import { describe, expect, it } from 'vitest';
import { getStore } from './data';
import { buildAlerts, type Alert } from './insights';
import { buildBriefing, type Briefing } from './narrative';
import { parseRange } from './range';
import type { MonthRange } from './types';
import type { Scope } from './metrics';

const store = getStore();
const all = parseRange({}, store.months);
const RANGES: Record<string, MonthRange> = {
  all,
  q4: { from: '2025-10', to: '2025-12' },
  dec: { from: '2025-12', to: '2025-12' },
  jun: { from: '2025-06', to: '2025-06' },
};

/** The alerts each page shows: overview rolls up, rep pages add their branch's rep alerts. */
function alertsFor(scope: Scope, range: MonthRange): Alert[] {
  if (scope.repId) {
    const rep = store.repById.get(scope.repId)!;
    return [
      ...buildAlerts(store, range, scope),
      ...buildAlerts(store, range, { branchId: rep.branch_id }).filter((a) => a.repId === rep.id),
    ];
  }
  return buildAlerts(store, range, scope, { rollUpBranches: !scope.branchId });
}

const SCOPES: Scope[] = [
  {},
  ...store.branches.map((b) => ({ branchId: b.id })),
  ...store.reps.map((r) => ({ repId: r.id })),
];

function briefingText(b: Briefing): string[] {
  return [b.headline, ...b.parts.map((p) => p.text)];
}

const BAD: Array<[string, RegExp]> = [
  ['"1 <plural>"', /\b1 (leads|orders|cars|units|deliveries|days|branches|delays|customers|bookings)\b/],
  ['"0 of them"', /\b0 of them\b/],
  ['missing value "–"', /(^|[\s(])–([\s).,]|$)/],
  ['"of 1 already"', /\bof 1 already\b/],
  ['"0 units (0%)"', /0 units \(0%\)/],
  ['"NaN"', /NaN|undefined/],
];

describe('copy sweep: every alert and briefing, every scope, four ranges', () => {
  for (const [rangeName, range] of Object.entries(RANGES)) {
    it(`has no broken copy for ${rangeName}`, () => {
      const problems: string[] = [];
      for (const scope of SCOPES) {
        const alerts = alertsFor(scope, range);
        const texts = [
          ...alerts.flatMap((a) => [a.title, a.detail, a.action, a.impact]),
          ...briefingText(buildBriefing(store, scope, range, alerts)),
        ];
        for (const t of texts) {
          for (const [name, re] of BAD) {
            if (re.test(t)) problems.push(`${JSON.stringify(scope)} ${name}: ${t}`);
          }
        }
      }
      expect(problems).toEqual([]);
    });
  }
});

describe('W9 briefing structure', () => {
  it('has what, why and do parts in that order for the group', () => {
    const alerts = alertsFor({}, all);
    const b = buildBriefing(store, {}, all, alerts);
    const kinds = b.parts.map((p) => p.kind);
    expect(kinds).toContain('what');
    expect(kinds.slice(-2)).toEqual(['why', 'do']);
    expect(b.points).toEqual(b.parts.map((p) => p.text));
  });

  it('takes "why" and "do" from the strongest alert, with owner and link', () => {
    for (const scope of [{}, { branchId: 'B3' }] as Scope[]) {
      const alerts = alertsFor(scope, all);
      const top = alerts[0]!;
      const b = buildBriefing(store, scope, all, alerts);
      const why = b.parts.find((p) => p.kind === 'why')!;
      const act = b.parts.find((p) => p.kind === 'do')!;
      expect(why.text.startsWith(top.title)).toBe(true);
      expect(act.text).toBe(top.action);
      if (act.kind === 'do' && top.owner) expect(act.owner).toEqual(top.owner);
    }
    // Group view: a branch alert links to that branch.
    const groupAlerts = alertsFor({}, all);
    const branchTop = groupAlerts.find((a) => a.branchId && !a.repId)!;
    const b = buildBriefing(store, {}, all, [branchTop]);
    const act = b.parts.find((p) => p.kind === 'do');
    expect(act && act.kind === 'do' && act.href).toBe(`/branches/${branchTop.branchId}`);
    expect(act && act.kind === 'do' && act.linkLabel).toMatch(/^Open .+ →$/);
  });

  it('writes the zero-delivery headline for June', () => {
    const b = buildBriefing(store, {}, RANGES.jun!, alertsFor({}, RANGES.jun!));
    expect(b.headline).toMatch(/^No cars were handed over in Jun 2025; \d+ orders? from this period (is|are) booked and waiting\.$/);
    expect(b.parts.some((p) => /leads with 0 units/.test(p.text))).toBe(false);
  });

  it('skips the conversion line for a rep with no leads in range', () => {
    for (const r of store.reps) {
      const b = buildBriefing(store, { repId: r.id }, RANGES.dec!, alertsFor({ repId: r.id }, RANGES.dec!));
      expect(b.parts.some((p) => /Converted – of 0/.test(p.text))).toBe(false);
    }
  });

  it('does not rank tied delay causes', () => {
    const texts = SCOPES.flatMap((s) => alertsFor(s, all))
      .filter((a) => a.kind === 'delivery_delay')
      .map((a) => a.detail);
    for (const t of texts) {
      const m = /The top cause is "[^"]+" \((\d+)\), followed by "[^"]+" \((\d+)\)/.exec(t);
      if (m) expect(m[1]).not.toBe(m[2]);
    }
  });
});
