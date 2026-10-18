import type { DataStore } from './data';
import { formatInr, formatMonth, formatPct, plural } from './format';
import { sortAlerts, type Alert, type AlertOwner } from './insights';
import { STUCK_ORDER_DAYS, branchRows, monthlyTrend, repRows, scopedLeads, summarize, type Scope } from './metrics';
import { inRange } from './range';
import type { MonthRange } from './types';

/**
 * One line of the briefing:
 * - `what`: what happened in the period.
 * - `why`: the main cause, taken from the strongest alert.
 * - `do`: the first thing to do, with its owner and a link.
 */
export type BriefingPart =
  | { kind: 'what'; text: string }
  | { kind: 'why'; text: string }
  | {
      kind: 'do';
      text: string;
      owner?: AlertOwner;
      /** Path without the query string; the card appends the current query. */
      href?: string;
      linkLabel?: string;
    };

export interface Briefing {
  headline: string;
  parts: BriefingPart[];
  /** @deprecated Use `parts`. Plain text of every part, kept for one wave. */
  points: string[];
}

function periodLabel(range: MonthRange): string {
  return range.from === range.to
    ? formatMonth(range.from)
    : `${formatMonth(range.from, true)}–${formatMonth(range.to)}`;
}

function momentum(store: DataStore, scope: Scope, range: MonthRange): string | null {
  const trend = monthlyTrend(store, scope, range).filter((p) => p.units > 0 || p.leads > 0);
  // Too few cars to call a trend; a "best month" of 2 units says nothing.
  if (trend.length < 3 || trend.reduce((s, p) => s + p.units, 0) < 10) return null;
  const best = trend.reduce((a, b) => (b.units > a.units ? b : a));
  const half = Math.floor(trend.length / 2);
  const firstHalf = trend.slice(0, half).reduce((s, p) => s + p.units, 0) / half;
  const secondHalf = trend.slice(-half).reduce((s, p) => s + p.units, 0) / half;
  const direction =
    secondHalf > firstHalf * 1.15
      ? 'Deliveries are picking up'
      : secondHalf < firstHalf * 0.85
        ? 'Deliveries are slowing'
        : 'Deliveries are flat';
  return `${direction}: ${formatMonth(best.month)} was the strongest month with ${plural(best.units, 'unit')}.`;
}

/** First sentence of an alert's detail, for the "why" line. */
function firstSentence(text: string): string {
  const match = /^.*?[.!?](?=\s|$)/.exec(text);
  return (match ? match[0] : text).trim();
}

function strongest(alerts: Alert[]): Alert | undefined {
  return sortAlerts(alerts)[0];
}

function whyPart(top: Alert | undefined): BriefingPart | null {
  if (!top) return null;
  const detail = firstSentence(top.detail);
  return { kind: 'why', text: detail ? `${top.title}. ${detail}` : `${top.title}.` };
}

function doPart(store: DataStore, scope: Scope, top: Alert | undefined): BriefingPart | null {
  if (!top) return null;
  const part: Extract<BriefingPart, { kind: 'do' }> = { kind: 'do', text: top.action };
  if (top.owner) part.owner = top.owner;
  if (top.repId && top.repId !== scope.repId) {
    const rep = store.repById.get(top.repId);
    part.href = `/reps/${top.repId}`;
    part.linkLabel = `Open ${rep?.name ?? top.repId} →`;
  } else if (top.branchId && top.branchId !== scope.branchId) {
    const branch = store.branchById.get(top.branchId);
    part.href = `/branches/${top.branchId}`;
    part.linkLabel = `Open ${branch?.name ?? top.branchId} →`;
  } else if (!top.branchId && !top.repId) {
    part.href = '/actions';
    part.linkLabel = 'Open Action center →';
  }
  return part;
}

/** Orders placed in the range that are still waiting for delivery. */
function waitingOrders(store: DataStore, scope: Scope, range: MonthRange): number {
  return scopedLeads(store, scope).filter(
    (l) => l.effectiveStatus === 'order_placed' && l.orderedAt && inRange(l.orderedAt.slice(0, 7), range),
  ).length;
}

function zeroDeliveryHeadline(store: DataStore, scope: Scope, range: MonthRange, who: string): string {
  const waiting = waitingOrders(store, scope, range);
  const prefix = who ? `${who} handed over no cars in ${periodLabel(range)}` : `No cars were handed over in ${periodLabel(range)}`;
  return waiting > 0
    ? `${prefix}; ${plural(waiting, 'order')} from this period ${waiting === 1 ? 'is' : 'are'} booked and waiting.`
    : `${prefix}.`;
}

function conversionLine(leads: number, conversion: number, lossRate: number): string | null {
  if (leads === 0) return null;
  return `Converted ${formatPct(conversion)} of ${plural(leads, 'new lead')} to orders and lost ${formatPct(lossRate)}.`;
}

function finish(headline: string, what: string[], alerts: Alert[], store: DataStore, scope: Scope): Briefing {
  const top = strongest(alerts);
  const parts: BriefingPart[] = what.map((text) => ({ kind: 'what' as const, text }));
  const why = whyPart(top);
  const act = doPart(store, scope, top);
  if (why) parts.push(why);
  if (act) parts.push(act);
  return { headline, parts, points: parts.map((p) => p.text) };
}

/** A short plain-English read-out of the period, written for a non-technical CEO. */
export function buildBriefing(store: DataStore, scope: Scope, range: MonthRange, alerts: Alert[]): Briefing {
  const s = summarize(store, scope, range);
  const period = periodLabel(range);
  const what: string[] = [];

  if (scope.repId) {
    const rep = store.repById.get(scope.repId);
    const name = rep?.name ?? scope.repId;
    if (s.leads === 0 && s.units === 0 && s.openLeads === 0) {
      return finish(`${name} had no leads or deliveries in ${period}.`, [], alerts, store, scope);
    }
    const headline =
      s.units > 0
        ? `${name} delivered ${plural(s.units, 'car')} worth ${formatInr(s.revenue)} in ${period}.`
        : zeroDeliveryHeadline(store, scope, range, name);
    const peers = repRows(store, rep?.branch_id, range).filter((r) => r.summary.leads > 0);
    const rank = peers.findIndex((r) => r.repId === scope.repId) + 1;
    if (rank > 0 && peers.length > 1) what.push(`Ranks ${rank} of ${peers.length} at the branch by delivered revenue.`);
    const conv = conversionLine(s.leads, s.conversion, s.lossRate);
    if (conv) what.push(conv);
    if (s.openLeads > 0) {
      const cold = s.coldLeads > 0 ? `, ${s.coldLeads} of them going cold` : '';
      what.push(`${plural(s.openLeads, 'open lead')} worth ${formatInr(s.openPipelineValue)}${cold}.`);
    }
    return finish(headline, what, alerts, store, scope);
  }

  if (scope.branchId) {
    const branch = store.branchById.get(scope.branchId);
    const name = branch?.name ?? scope.branchId;
    const ranked = branchRows(store, range).sort((a, b) => b.summary.units - a.summary.units);
    const me = ranked.find((b) => b.branchId === scope.branchId);
    const target = Number.isFinite(s.unitAttainment) ? `, ${formatPct(s.unitAttainment)} of its unit target` : '';
    const headline =
      s.units > 0
        ? `${name} delivered ${plural(s.units, 'car')} worth ${formatInr(s.revenue)} in ${period}${target}.`
        : zeroDeliveryHeadline(store, scope, range, name);
    // Ties share a rank; skip the line when every branch delivered the same.
    if (me && ranked.some((b) => b.summary.units !== me.summary.units)) {
      const rank = ranked.filter((b) => b.summary.units > me.summary.units).length + 1;
      const tied = ranked.filter((b) => b.summary.units === me.summary.units).length > 1;
      what.push(`Ranks ${rank}${tied ? ' (tied)' : ''} of ${ranked.length} branches by units delivered.`);
    }
    const conv = conversionLine(s.leads, s.conversion, s.lossRate);
    if (conv) what.push(conv);
    const m = momentum(store, scope, range);
    if (m) what.push(m);
    return finish(headline, what, alerts, store, scope);
  }

  const rows = branchRows(store, range).sort((a, b) => b.summary.units - a.summary.units);
  const best = rows[0];
  const worst = rows[rows.length - 1];
  const target = Number.isFinite(s.unitAttainment) ? `, ${formatPct(s.unitAttainment)} of the unit target` : '';
  const headline =
    s.units > 0
      ? `The group delivered ${plural(s.units, 'car')} worth ${formatInr(s.revenue)} in ${period}${target}.`
      : zeroDeliveryHeadline(store, scope, range, '');
  if (best && worst && best.summary.units > worst.summary.units) {
    const leaders = rows.filter((r) => r.summary.units === best.summary.units);
    const trailers = rows.filter((r) => r.summary.units === worst.summary.units);
    const att = (u: number) => (Number.isFinite(u) ? ` (${formatPct(u)} of target)` : '');
    const lead =
      leaders.length === 1
        ? `${best.name} leads with ${plural(best.summary.units, 'unit')}${att(best.summary.unitAttainment)}.`
        : `${leaders.map((r) => r.name).join(' and ')} lead with ${plural(best.summary.units, 'unit')} each.`;
    const trail =
      trailers.length === 1
        ? `${worst.name} trails with ${plural(worst.summary.units, 'unit')}${att(worst.summary.unitAttainment)}.`
        : `${trailers.map((r) => r.name).join(' and ')} trail with ${plural(worst.summary.units, 'unit')} each.`;
    what.push(`${lead} ${trail}`);
  }
  const m = momentum(store, scope, range);
  if (m) what.push(m);
  if (s.openLeads > 0 || s.stuckOrders > 0) {
    const open = `${plural(s.openLeads, 'open lead')} (${formatInr(s.openPipelineValue)}) ${s.openLeads === 1 ? 'is' : 'are'} in play`;
    const stuck =
      s.stuckOrders > 0
        ? `, and ${plural(s.stuckOrders, 'booked order')} (${formatInr(s.stuckOrderValue)}) ${
            s.stuckOrders === 1 ? 'is' : 'are'
          } waiting more than ${STUCK_ORDER_DAYS} days for delivery`
        : '';
    what.push(`Right now ${open}${stuck}.`);
  }
  return finish(headline, what, alerts, store, scope);
}
