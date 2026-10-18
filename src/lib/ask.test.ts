import { describe, expect, it } from 'vitest';
import { DEFAULT_MODEL, readAskConfig } from './askConfig';
import { MAX_BODY_BYTES, parseAskRequest } from './askRequest';
import { answerCurated, offlineAnswer } from './curatedAnswers';
import { CURATED_QUESTIONS, matchCurated } from './curatedQuestions';
import { getStore } from './data';
import { CHASE_LABEL, VERIFY_LABEL, buildFactSheet, targetMultiple } from './factsheet';
import { formatPct } from './format';
import { GLOSSARY } from './glossary';
import { KIND_LABEL, buildAlerts } from './insights';
import { pastPromised, summarize } from './metrics';
import { parseRange } from './range';
import { clientIp, createRateLimiter } from './rateLimit';
import { extractNumbers, verifyNumbers } from './verifyNumbers';

const store = getStore();
const all = parseRange({}, store.months);
const q4 = { from: '2025-10', to: '2025-12' };
const PHONE_RE = /\b[6-9]\d{9}\b/;

describe('fact sheet', () => {
  const scopes = [{}, { branchId: 'B3' }, { repId: 'SR2' }];

  it('contains no phone numbers or customer names', () => {
    const repNames = new Set(store.reps.map((r) => r.name));
    const customers = [...new Set(store.leads.map((l) => l.customer_name))].filter((n) => !repNames.has(n));
    expect(customers).toContain('Hema Rajan');
    for (const scope of scopes) {
      for (const range of [all, q4]) {
        const sheet = buildFactSheet(store, range, scope);
        expect(sheet).not.toMatch(PHONE_RE);
        for (const name of customers) expect(sheet).not.toContain(name);
      }
    }
  });

  it('is deterministic for a range and scope', () => {
    for (const scope of scopes) {
      expect(buildFactSheet(store, q4, scope)).toBe(buildFactSheet(store, q4, scope));
    }
    expect(buildFactSheet(store, all)).not.toBe(buildFactSheet(store, q4));
  });

  it('carries the glossary, as-of date and computed target multiple', () => {
    const sheet = buildFactSheet(store, all);
    expect(sheet).toContain('Lead → order');
    expect(sheet).toContain('As of (treat as today): 31 Dec 2025');
    expect(sheet).toContain(GLOSSARY.open_pipeline.definition);
    const multiple = targetMultiple(store, all);
    expect(multiple).toBeCloseTo(1426 / 160, 5);
    expect(sheet).toContain(`about ${multiple.toFixed(1)}×`);
  });
});

describe('parseAskRequest', () => {
  const ok = (body: unknown) => parseAskRequest(body, store);

  it('accepts a valid request and trims the question', () => {
    const r = ok({ question: '  How far behind target?  ', from: '2025-10', to: '2025-12', branchId: 'B3' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.question).toBe('How far behind target?');
      expect(r.value.range).toEqual(q4);
      expect(r.value.scope).toEqual({ branchId: 'B3' });
    }
  });

  it('defaults to the full range and drops leading assistant turns', () => {
    const r = ok({ question: 'Hi', history: [{ role: 'assistant', text: 'x' }, { role: 'user', text: 'y' }] });
    expect(r.ok && r.value.range).toEqual(all);
    expect(r.ok && r.value.history).toEqual([{ role: 'user', text: 'y' }]);
  });

  it.each([
    ['not an object', 'hello'],
    ['an array', [1]],
    ['no question', {}],
    ['an empty question', { question: '   ' }],
    ['a non-string question', { question: 42 }],
    ['a question over 500 characters', { question: 'a'.repeat(501) }],
    ['an unknown field', { question: 'Hi', extra: true }],
    ['history that is not a list', { question: 'Hi', history: 'nope' }],
    ['more than 4 history items', { question: 'Hi', history: Array(5).fill({ role: 'user', text: 'x' }) }],
    ['a history item with a bad role', { question: 'Hi', history: [{ role: 'system', text: 'x' }] }],
    ['a history item over 1500 characters', { question: 'Hi', history: [{ role: 'user', text: 'a'.repeat(1501) }] }],
    ['a malformed month', { question: 'Hi', from: '2025-13' }],
    ['a month outside the data', { question: 'Hi', to: '2024-01' }],
    ['an unknown branch', { question: 'Hi', branchId: 'B9' }],
    ['an unknown rep', { question: 'Hi', repId: 'SR999' }],
    ['a rep from another branch', { question: 'Hi', branchId: 'B3', repId: 'SR2' }],
  ])('rejects %s', (_label, body) => {
    const r = ok(body);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.length).toBeGreaterThan(0);
  });

  it('caps the body at about 16 KB', () => {
    expect(MAX_BODY_BYTES).toBe(16 * 1024);
  });
});

describe('curated answers', () => {
  const ranges = [all, q4, { from: '2025-12', to: '2025-12' }];
  const scopes = [{}, { branchId: 'B3' }, { branchId: 'B1' }, { repId: 'SR2' }];

  it('answers every question for every range and scope', () => {
    for (const range of ranges) {
      for (const scope of scopes) {
        for (const q of CURATED_QUESTIONS) {
          const text = answerCurated(store, range, scope, q.id);
          expect(text.length, `${q.id} ${JSON.stringify(scope)} ${range.from}`).toBeGreaterThan(20);
          expect(text).not.toMatch(/NaN|undefined|Infinity/);
          expect(text).not.toMatch(PHONE_RE);
        }
      }
    }
  });

  it('names Lakeside as the branch to look at first', () => {
    expect(answerCurated(store, all, {}, 'attention')).toMatch(/^Lakeside Toyota needs attention first/);
  });

  it('lists every Lakeside alert, in buildAlerts order', () => {
    for (const range of [all, q4]) {
      const expected = buildAlerts(store, range, { branchId: 'B3' });
      const text = answerCurated(store, range, {}, 'attention');
      const lines = text.split('\n').filter((l) => l.startsWith('- '));
      expect(lines).toEqual(expected.map((a) => `- ${KIND_LABEL[a.kind]}: ${a.title} (${a.impact})`));
    }
    const kinds = new Set(buildAlerts(store, all, { branchId: 'B3' }).map((a) => a.kind));
    for (const kind of ['never_contacted_process', 'status_unclear', 'stuck_verify'] as const) {
      expect(kinds.has(kind), kind).toBe(true);
    }
  });

  it('lists every alert for a branch scope after the top one', () => {
    const expected = buildAlerts(store, all, { branchId: 'B3' });
    const lines = answerCurated(store, all, { branchId: 'B3' }, 'attention')
      .split('\n')
      .filter((l) => l.startsWith('- '));
    expect(lines).toHaveLength(expected.length - 1);
  });

  it('matches typed questions by keyword and lists questions when nothing matches', () => {
    expect(matchCurated('Which booked orders are stuck?')).toBe('stuck');
    expect(matchCurated('why are deliveries late')).toBe('delays');
    expect(matchCurated('how is the Fortuner doing')).toBe('models');
    expect(matchCurated('what is the weather in Chennai')).toBeNull();
    const fallback = offlineAnswer(store, all, {}, 'tell me a joke');
    expect(fallback.matched).toBeNull();
    for (const q of CURATED_QUESTIONS) expect(fallback.answer).toContain(q.question);
  });
});

describe('chatbot matches the dashboard', () => {
  const s = summarize(store, {}, all);
  const alerts = buildAlerts(store, all, {}, { rollUpBranches: true });
  const count = (kind: string) => alerts.filter((a) => a.kind === kind).reduce((n, a) => n + a.leads.length, 0);
  const chase = count('stuck_orders');
  const verify = count('stuck_verify');
  const sheet = buildFactSheet(store, all);

  it('uses the shared loss, cold, stuck and status-unclear rules', () => {
    expect(formatPct(s.lossRate)).toBe('54%');
    expect(s.statusUnclear).toBe(14);
    expect(s.neverContactedTotal).toBe(119);
    expect(s.closedWithoutCall).toBe(112);
    expect(chase + verify).toBe(s.stuckOrders);
    expect(verify).toBeGreaterThan(0);
  });

  it('quotes the same figures in the fact sheet', () => {
    const groupRow = sheet.split('\n').find((l) => l.startsWith('| Group |'));
    expect(groupRow).toContain(` ${formatPct(s.lossRate)} |`);
    expect(groupRow).toContain(` ${s.coldLeads} | ${s.stuckOrders} |`);
    expect(sheet).toContain(`${CHASE_LABEL}: ${chase} (`);
    expect(sheet).toContain(`${VERIFY_LABEL}: ${verify} (`);
    expect(sheet).toContain(`Status unclear (confirm status): ${s.statusUnclear}.`);
    expect(sheet).toContain(`${GLOSSARY.never_contacted.label} (of leads created in the period): ${s.neverContactedTotal}.`);
    expect(sheet).toContain(`${GLOSSARY.closed_without_call.label}: ${s.closedWithoutCall}.`);
    expect(sheet).toContain(`${s.neverContactedTotal} leads never got a first call`);
    expect(sheet).toContain(GLOSSARY.status_unclear.definition);
  });

  it('quotes the same figures in the curated answers', () => {
    const losing = answerCurated(store, all, {}, 'losing');
    expect(losing).toContain(`Leads lost ${formatPct(s.lossRate)}`);
    expect(losing).toContain(`${s.statusUnclear} leads are marked lost with no loss recorded — confirm status`);
    expect(losing).toContain(
      `${s.neverContactedTotal} leads never got a first call (${GLOSSARY.never_contacted.label}); ${s.closedWithoutCall} of them were closed as lost (${GLOSSARY.closed_without_call.label}), and none reached an order.`,
    );
    expect(losing).not.toMatch(/still new \d+ hours/);
    expect(answerCurated(store, all, {}, 'pipeline')).toContain(`${s.coldLeads} of them are cold`);
    const stuck = answerCurated(store, all, {}, 'stuck');
    expect(stuck).toContain(`${chase} to chase delivery`);
    expect(stuck).toContain(`${verify} likely cancelled`);
    expect(stuck).toContain(`${pastPromised(store, {}).count} of`);
    expect(stuck).toContain(VERIFY_LABEL);
  });
});

describe('verifyNumbers', () => {
  const sheet = 'Units 160. Lead → order 47%. Revenue INR 11.4 Cr. Avg 18.3 d. Gap INR 26.9 Cr. Deal INR 24.3 L. Targets 1,426.';

  it('extracts figures and skips dates, years and IDs', () => {
    const found = extractNumbers('As of 31 Dec 2025, L0022 (SR19) in Q4 had 47% and INR 11.4 Cr; Dec 2025 saw 1,426.');
    expect(found.map((n) => [n.value, n.unit])).toEqual([
      [47, 'pct'],
      [11.4, 'cr'],
      [1426, 'plain'],
    ]);
    expect(found[1]?.raw).toBe('INR 11.4 Cr');
  });

  it('verifies figures that appear in the fact sheet, including rounding', () => {
    expect(verifyNumbers('We delivered 160 units, 47% Lead → order, INR 11.4 Cr, about 18 days.', sheet)).toEqual({
      verified: true,
      unverifiedNumbers: [],
    });
    expect(verifyNumbers('No figures here.', sheet).verified).toBe(true);
  });

  it('reports figures it cannot find, or that use a different unit', () => {
    const r = verifyNumbers('Revenue was INR 12.0 Cr and 160% of plan, with 52 orders.', sheet);
    expect(r.verified).toBe(false);
    expect(r.unverifiedNumbers).toEqual(['INR 12.0 Cr', '160%', '52']);
  });
});

describe('config and rate limit', () => {
  it('goes offline without a key or with the kill switch off', () => {
    expect(readAskConfig({}).live).toBe(false);
    expect(readAskConfig({ ANTHROPIC_API_KEY: 'k', ASK_AI_ENABLED: 'false' }).live).toBe(false);
    expect(readAskConfig({ ANTHROPIC_API_KEY: 'k' }).live).toBe(true);
  });

  it('reads the model and limits, falling back on invalid values', () => {
    expect(readAskConfig({})).toMatchObject({ model: DEFAULT_MODEL, perMinute: 8, perDay: 60 });
    expect(
      readAskConfig({ ASK_AI_MODEL: 'claude-x-1', ASK_AI_RATE_LIMIT_PER_MINUTE: '3', ASK_AI_RATE_LIMIT_PER_DAY: '20' }),
    ).toMatchObject({ model: 'claude-x-1', perMinute: 3, perDay: 20 });
    for (const bad of ['0', '-1', '2.5', 'abc', '']) {
      expect(readAskConfig({ ASK_AI_RATE_LIMIT_PER_MINUTE: bad }).perMinute).toBe(8);
    }
    expect(readAskConfig({ ASK_AI_MODEL: 'bad model!' }).model).toBe(DEFAULT_MODEL);
  });

  it('limits per minute and per day', () => {
    const limiter = createRateLimiter({ perMinute: 2, perDay: 3 });
    const t = 1_000_000;
    expect(limiter.check('a', t).ok).toBe(true);
    expect(limiter.check('a', t + 1).ok).toBe(true);
    expect(limiter.check('a', t + 2)).toMatchObject({ ok: false, window: 'minute' });
    expect(limiter.check('b', t + 2).ok).toBe(true);
    expect(limiter.check('a', t + 61_000).ok).toBe(true);
    expect(limiter.check('a', t + 122_000)).toMatchObject({ ok: false, window: 'day' });
  });

  it('reads the client IP from the first x-forwarded-for hop', () => {
    expect(clientIp(new Headers({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' }))).toBe('203.0.113.7');
    expect(clientIp(new Headers())).toBe('unknown');
  });
});
