import { formatMonth, formatPct, SOURCE_LABEL, STATUS_LABEL } from './format';
import type { CountRow, FunnelStep, MonthPoint, SourceRow } from './metrics';
import { NOT_RECORDED } from './metrics';
import { overallMultiple } from './targetMultiples';
import type { LeadSource } from './types';

/**
 * Section titles that state the point ("Dec 2025 was the best month …") instead of naming the
 * chart. Each returns the takeaway as `title` with the old noun as `kicker`, or falls back to the
 * noun alone when there is too little data (n below MIN_N) or the sentence would be too long.
 */

export interface Takeaway {
  title: string;
  kicker?: string;
}

/** Below this many items a takeaway would over-read noise, so the noun title is used. */
export const MIN_N = 10;
export const MAX_TITLE = 80;

function make(title: string | null, noun: string): Takeaway {
  if (!title || title.length > MAX_TITLE) return { title: noun };
  return { title, kicker: noun };
}

const SOURCE_PLURAL: Record<LeadSource, string> = {
  walk_in: 'Walk-ins',
  website: 'Website leads',
  referral: 'Referrals',
  social_media: 'Social media leads',
  phone_enquiry: 'Phone enquiries',
  auto_expo: 'Auto expo leads',
};

function oneDecimal(x: number): string {
  return x >= 10 ? String(Math.round(x)) : x.toFixed(1).replace(/\.0$/, '');
}

/** Deliveries by month: the best month and how it compares with its target. */
export function trendTakeaway(points: MonthPoint[], noun = 'Deliveries vs target'): Takeaway {
  const total = points.reduce((s, p) => s + p.units, 0);
  if (points.length < 2 || total < MIN_N) return make(null, noun);
  const best = points.reduce((a, b) => (b.units > a.units ? b : a));
  if (points.filter((p) => p.units === best.units).length > 1) return make(null, noun);
  const lead = `${formatMonth(best.month)} was the best month (${best.units} units)`;
  const multiple = overallMultiple(best.targetUnits, best.units);
  if (multiple === null) return make(lead, noun);
  if (multiple <= 1) return make(`${lead} and met its target`, noun);
  if (multiple < 1.5) return make(`${lead}, at ${formatPct(1 / multiple)} of its target`, noun);
  return make(`${lead}, still ${Math.round(multiple)}× below its target`, noun);
}

/** Funnel: the stage-to-stage step that loses the most leads. */
export function funnelTakeaway(steps: FunnelStep[], noun = 'Sales funnel'): Takeaway {
  const total = steps[0]?.count ?? 0;
  if (total < MIN_N) return make(null, noun);
  let worst = -1;
  let worstRate = Infinity;
  steps.forEach((s, i) => {
    // A step out of a stage holding fewer than MIN_N leads is too small to headline.
    const prevCount = steps[i - 1]?.count ?? 0;
    if (i > 0 && prevCount >= MIN_N && Number.isFinite(s.fromPrevious) && s.fromPrevious < worstRate) {
      worstRate = s.fromPrevious;
      worst = i;
    }
  });
  const from = steps[worst - 1];
  const to = steps[worst];
  if (!from || !to) return make(null, noun);
  return make(
    `Biggest drop is ${STATUS_LABEL[from.stage]} → ${STATUS_LABEL[to.stage]}: ${formatPct(1 - to.fromPrevious)} stop there`,
    noun,
  );
}

/** Lost or delay reasons: the top cause, or the tied top causes. */
export function reasonTakeaway(
  rows: CountRow[],
  noun: string,
  phrase: { one: string; many: string; unrecorded: string },
): Takeaway {
  const total = rows.reduce((s, r) => s + r.count, 0);
  const [first] = rows;
  if (!first || total < MIN_N) return make(null, noun);
  const tied = rows.filter((r) => r.count === first.count);
  if (tied.length === 1 && first.label === NOT_RECORDED) {
    return make(`${phrase.unrecorded} (${formatPct(first.share)})`, noun);
  }
  const named = tied.filter((r) => r.label !== NOT_RECORDED);
  if (named.length === 1) {
    return make(`${named[0]!.label} ${phrase.one} (${formatPct(first.share)})`, noun);
  }
  if (named.length === 2) {
    return make(`${named[0]!.label} and ${named[1]!.label} ${phrase.many} (${first.count} each)`, noun);
  }
  return make(null, noun);
}

export function lostTakeaway(rows: CountRow[], noun = 'Why leads are lost'): Takeaway {
  return reasonTakeaway(rows, noun, {
    one: 'is the top reason leads are lost',
    many: 'are the top reasons leads are lost',
    unrecorded: 'Most lost leads have no reason recorded',
  });
}

export function delayTakeaway(rows: CountRow[], noun = 'Delivery delays'): Takeaway {
  return reasonTakeaway(rows, noun, {
    one: 'is the top cause of delays',
    many: 'are the top causes of delays',
    unrecorded: 'Most delays have no cause recorded',
  });
}

/** Sources: best against worst conversion, among sources with enough leads to compare. */
export function sourceTakeaway(rows: SourceRow[], noun = 'Lead sources'): Takeaway {
  const eligible = rows.filter((r) => r.leads >= MIN_N && Number.isFinite(r.conversion));
  if (eligible.length < 2) return make(null, noun);
  const best = eligible.reduce((a, b) => (b.conversion > a.conversion ? b : a));
  const worst = eligible.reduce((a, b) => (b.conversion < a.conversion ? b : a));
  if (best === worst || best.conversion === worst.conversion) return make(null, noun);
  const lead = `${SOURCE_PLURAL[best.source]} convert at ${formatPct(best.conversion)}`;
  const other = SOURCE_LABEL[worst.source].toLowerCase();
  if (worst.conversion === 0) return make(`${lead}; ${other} converts none`, noun);
  return make(`${lead}, ${oneDecimal(best.conversion / worst.conversion)}× ${other}`, noun);
}
