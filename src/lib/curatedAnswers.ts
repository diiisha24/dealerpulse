import type { DataStore } from './data';
import {
  CHASE_LABEL,
  VERIFY_LABEL,
  alertsForScope,
  modelPerformance,
  neverContactedSentence,
  periodLabel,
  scopeLabel,
  stageVelocity,
  stuckOrders,
  targetMultiple,
  type StuckOrder,
} from './factsheet';
import { SOURCE_LABEL, STATUS_LABEL, formatDate, formatInr, formatPct, plural } from './format';
import { GLOSSARY } from './glossary';
import { KIND_LABEL, type Alert } from './insights';
import {
  branchRows,
  cohort,
  delayReasons,
  funnel,
  isColdLead,
  lostReasons,
  pastPromised,
  repRows,
  scopedDeliveries,
  scopedLeads,
  slowestDeliveryDays,
  sourcePerformance,
  summarize,
  type Scope,
} from './metrics';
import { CURATED_QUESTIONS, matchCurated, type CuratedId } from './curatedQuestions';
import { inRange } from './range';
import { COLD_LEAD_DAYS, STUCK_ORDER_DAYS } from './thresholds';
import type { MonthRange } from './types';

/**
 * Deterministic answers to the curated decision questions, written from our
 * own metrics. They power offline mode (no API key) and match the dashboard
 * figures exactly. Paragraphs are separated by blank lines; "- " starts a bullet.
 */

interface Ctx {
  store: DataStore;
  range: MonthRange;
  scope: Scope;
  period: string;
  label: string;
  /** The label at the start of a sentence ("The group"). */
  Label: string;
}

const short = (name: string): string => name.replace(' Toyota', '');
const bullets = (lines: string[]): string => lines.map((l) => `- ${l}`).join('\n');
const para = (...blocks: Array<string | null | false | undefined>): string =>
  blocks.filter((b): b is string => Boolean(b)).join('\n\n');

/** The branch a scope belongs to (a rep's branch for a rep scope). */
function scopeBranchId(ctx: Ctx): string | undefined {
  return ctx.scope.repId ? ctx.store.repById.get(ctx.scope.repId)?.branch_id : ctx.scope.branchId;
}

function attention(ctx: Ctx): string {
  const { store, range, scope } = ctx;
  if (!scope.branchId && !scope.repId) {
    const group = summarize(store, {}, range);
    const rows = branchRows(store, range).sort(
      (a, b) =>
        a.summary.unitAttainment - b.summary.unitAttainment ||
        b.summary.lossRate - a.summary.lossRate ||
        a.branchId.localeCompare(b.branchId),
    );
    const worst = rows[0];
    if (!worst) return 'There are no branches in the data.';
    const alerts = alertsForScope(store, range, { branchId: worst.branchId });
    const s = worst.summary;
    return para(
      `${worst.name} needs attention first. In ${ctx.period} it delivered ${s.units} of ${s.targetUnits ?? 0} target units (${formatPct(s.unitAttainment)}), against ${formatPct(group.unitAttainment)} for the group. It lost ${formatPct(s.lossRate)} of its leads (group: ${formatPct(group.lossRate)}) and converted ${formatPct(s.conversion)} to orders (group: ${formatPct(group.conversion)}).`,
      alerts.length > 0 && `Its open alerts, most urgent first:\n${bullets(alerts.map(alertLine))}`,
      alerts[0] && `Next step: ${alerts[0].action}`,
    );
  }

  const alerts = alertsForScope(store, range, scope);
  const top = alerts[0];
  if (!top) return `${ctx.Label} has no open alerts for ${ctx.period}.`;
  return para(
    `For ${ctx.label}, start with this: ${top.title} (${top.impact}). ${top.detail}`,
    `Next step: ${top.action}`,
    alerts.length > 1 && `Also open, most urgent first:\n${bullets(alerts.slice(1).map(alertLine))}`,
  );
}

/** Every alert is listed, in `buildAlerts` order, tagged with the dashboard's kind label. */
function alertLine(a: Alert): string {
  return `${KIND_LABEL[a.kind]}: ${a.title} (${a.impact})`;
}

function target(ctx: Ctx): string {
  const { store, range, scope } = ctx;
  const multiple = targetMultiple(store, range);
  const realism = Number.isFinite(multiple)
    ? `For context, the group's unit targets are about ${multiple.toFixed(1)}× what it actually delivered in this period, so every branch looks far behind. Comparing branches with each other is more telling than comparing with the target.`
    : null;

  if (scope.repId) {
    const branchId = scopeBranchId(ctx);
    const b = branchId ? summarize(store, { branchId }, range) : null;
    const s = summarize(store, scope, range);
    return para(
      `Targets are set per branch, not per sales officer. ${ctx.Label} delivered ${plural(s.units, 'unit')} worth ${formatInr(s.revenue)} in ${ctx.period}.`,
      b &&
        `The branch delivered ${b.units} of ${b.targetUnits ?? 0} target units (${formatPct(b.unitAttainment)}) and ${formatInr(b.revenue)} of ${formatInr(b.targetRevenue ?? 0)} target revenue (${formatPct(b.revenueAttainment)}).`,
      realism,
    );
  }

  const s = summarize(store, scope, range);
  if (!s.targetUnits) return `There is no target set for ${ctx.label} in ${ctx.period}.`;
  const who = ctx.Label;
  const lines = [
    `${who} delivered ${s.units} of ${s.targetUnits} target units in ${ctx.period} (${formatPct(s.unitAttainment)}), ${s.targetUnits - s.units} units short.`,
    `Revenue delivered is ${formatInr(s.revenue)} of ${formatInr(s.targetRevenue ?? 0)} (${formatPct(s.revenueAttainment)}), a gap of ${formatInr((s.targetRevenue ?? 0) - s.revenue)}.`,
  ];
  const rows = branchRows(store, range).sort(
    (a, b) => b.summary.unitAttainment - a.summary.unitAttainment || a.branchId.localeCompare(b.branchId),
  );
  const ranking = bullets(
    rows.map((r) => `${r.name}: ${r.summary.units} of ${r.summary.targetUnits ?? 0} units (${formatPct(r.summary.unitAttainment)})`),
  );
  return para(lines.join(' '), `Unit attainment by branch:\n${ranking}`, realism);
}

function losing(ctx: Ctx): string {
  const { store, range, scope } = ctx;
  const leads = cohort(store, scope, range);
  if (leads.length === 0) return `${ctx.Label} has no leads created in ${ctx.period}.`;
  // Same rule as the dashboard: status-unclear leads are not lost (see `EnrichedLead.isLost`).
  const s = summarize(store, scope, range);
  const lost = leads.filter((l) => l.isLost).length;
  const steps = funnel(leads);
  const leak = [...steps].sort((a, b) => b.lostHere - a.lostHere)[0];
  const reasons = lostReasons(leads).slice(0, 4);
  return para(
    `${ctx.Label} lost ${lost} of ${plural(leads.length, 'lead')} created in ${ctx.period}: ${GLOSSARY.leads_lost.label} ${formatPct(s.lossRate)}.${
      leak && leak.lostHere > 0
        ? ` Most losses happen at the ${STATUS_LABEL[leak.stage]} stage: ${leak.lostHere} of ${lost}.`
        : ''
    }`,
    neverContactedSentence(store, scope, range),
    reasons.length > 0 && `Top lost reasons:\n${bullets(reasons.map((r) => `${r.label}: ${r.count} (${formatPct(r.share)})`))}`,
    `Funnel: ${steps.map((st) => `${STATUS_LABEL[st.stage]} ${st.count}`).join(' → ')}.`,
    s.statusUnclear > 0 &&
      `${plural(s.statusUnclear, 'lead is', 'leads are')} marked lost with no loss recorded — confirm status. Until confirmed they count as open, not lost.`,
  );
}

function stuck(ctx: Ctx): string {
  const orders = stuckOrders(ctx.store, ctx.scope);
  const asOf = formatDate(ctx.store.asOf);
  if (orders.length === 0) return `${ctx.Label} has no booked orders waiting more than ${STUCK_ORDER_DAYS} days for delivery as of ${asOf}.`;
  const sum = (list: StuckOrder[]) => formatInr(list.reduce((s, o) => s + o.value, 0));
  const chase = orders.filter((o) => !o.likelyCancelled);
  const verify = orders.filter((o) => o.likelyCancelled);
  const late = pastPromised(ctx.store, ctx.scope);
  const list = (items: StuckOrder[]) => {
    const shown = items.slice(0, 5);
    return `${bullets(shown.map((o) => `${o.leadId}: ${o.model}, ${short(o.branch)}, ${o.rep}, ${o.days} days, ${formatInr(o.value)}${o.pastPromised ? ', past promised date' : ''}`))}${
      items.length > shown.length ? `\n- and ${items.length - shown.length} more` : ''
    }`;
  };
  return para(
    `As of ${asOf}, ${ctx.label} has ${plural(orders.length, 'booked order')} not delivered after ${STUCK_ORDER_DAYS}+ days, worth ${sum(orders)}. ${chase.length} to chase delivery (${sum(chase)}) and ${verify.length} likely cancelled (${sum(verify)}), older than the slowest delivery on record (${slowestDeliveryDays(ctx.store)} days). ${late.count} of ${plural(late.total, 'booked order')} are past their promised date.`,
    chase.length > 0 && `${CHASE_LABEL}:\n${list(chase)}`,
    verify.length > 0 && `${VERIFY_LABEL}:\n${list(verify)}`,
    'Next step: chase allocation and finance for the recent orders and give each customer a firm date; call the oldest ones to confirm whether they are cancelled.',
  );
}

function officers(ctx: Ctx): string {
  const { store, range, scope } = ctx;
  const branchId = scopeBranchId(ctx);
  const rows = repRows(store, branchId, range).filter((r) => r.role === 'sales_officer' && r.summary.leads + r.summary.units > 0);
  if (rows.length === 0) return `No sales officer at ${ctx.label} had leads or deliveries in ${ctx.period}.`;
  const line = (r: (typeof rows)[number]) =>
    `${r.name} (${short(store.branchById.get(r.branchId)?.name ?? r.branchId)}): ${formatInr(r.summary.revenue)} from ${plural(r.summary.units, 'unit')}, Lead → order ${formatPct(r.summary.conversion)}${
      r.belowPeers ? ` (well below peers at ${formatPct(r.peerConversion)})` : ''
    }`;
  const n = Math.min(3, Math.floor(rows.length / 2) || 1);
  const where = branchId ? `at ${store.branchById.get(branchId)?.name ?? branchId}` : 'in the group';
  const parts = [
    `Ranked by delivered revenue in ${ctx.period} across ${plural(rows.length, 'sales officer')} ${where}.`,
    `Top:\n${bullets(rows.slice(0, n).map(line))}`,
    rows.length > n && `Bottom:\n${bullets(rows.slice(-n).reverse().map(line))}`,
  ];
  if (scope.repId) {
    const rank = rows.findIndex((r) => r.repId === scope.repId) + 1;
    const rep = store.repById.get(scope.repId);
    if (rep) parts.unshift(rank > 0 ? `${rep.name} ranks ${rank} of ${rows.length} at the branch.` : `${rep.name} had no leads or deliveries in ${ctx.period}.`);
  }
  return para(...parts);
}

function sources(ctx: Ctx): string {
  const leads = cohort(ctx.store, ctx.scope, ctx.range);
  const rows = sourcePerformance(leads).sort(
    (a, b) => b.conversion - a.conversion || b.leads - a.leads || a.source.localeCompare(b.source),
  );
  if (rows.length === 0) return `${ctx.Label} has no leads created in ${ctx.period}.`;
  // Ignore sources too small to say anything; fall back to all if every source is small.
  const sized = rows.filter((r) => r.leads >= 5);
  const pool = sized.length > 0 ? sized : rows;
  const best = pool[0]!;
  const worst = pool[pool.length - 1]!;
  return para(
    `${SOURCE_LABEL[best.source]} converts best for ${ctx.label} in ${ctx.period}: ${formatPct(best.conversion)} Lead → order from ${plural(best.leads, 'lead')}.${
      worst !== best ? ` ${SOURCE_LABEL[worst.source]} converts worst at ${formatPct(worst.conversion)} from ${plural(worst.leads, 'lead')}.` : ''
    }${sized.length > 0 && sized.length < rows.length ? ' Sources with fewer than 5 leads are left out of the comparison.' : ''}`,
    `All sources:\n${bullets(rows.map((r) => `${SOURCE_LABEL[r.source]}: ${r.leads} leads, ${formatPct(r.conversion)} Lead → order, ${formatInr(r.revenue)} delivered`))}`,
  );
}

function delays(ctx: Ctx): string {
  const { store, range, scope } = ctx;
  const deliveries = scopedDeliveries(store, scope).filter((d) => inRange(d.deliveryMonth, range));
  if (deliveries.length === 0) return `${ctx.Label} had no deliveries in ${ctx.period}.`;
  const reasons = delayReasons(deliveries);
  const delayed = reasons.reduce((s, r) => s + r.count, 0);
  const s = summarize(store, scope, range);
  const velocity = stageVelocity(cohort(store, scope, range)).find((v) => v.to === 'delivered');
  return para(
    `${delayed} of ${deliveries.length} deliveries for ${ctx.label} in ${ctx.period} were delayed (${formatPct(delayed / deliveries.length)}). Orders took ${s.avgDaysToDeliver.toFixed(1)} days on average to deliver.${
      velocity && Number.isFinite(velocity.medianDays) ? ` For leads created in the period, the median from order to delivery is ${velocity.medianDays.toFixed(1)} days.` : ''
    }`,
    reasons.length > 0 && `Causes:\n${bullets(reasons.slice(0, 5).map((r) => `${r.label}: ${r.count} (${formatPct(r.share)} of delays)`))}`,
    delayed > 0 && 'Next step: confirm delivery dates with customers at booking, and escalate allocation delays to the OEM weekly.',
  );
}

function models(ctx: Ctx): string {
  const rows = modelPerformance(ctx.store, ctx.scope, ctx.range);
  const revenue = rows.reduce((s, r) => s + r.revenue, 0);
  if (rows.length === 0 || revenue === 0) return `${ctx.Label} had no delivered revenue in ${ctx.period}.`;
  const top = rows.filter((r) => r.revenue > 0).slice(0, 3);
  const converter = [...rows]
    .filter((r) => r.leads >= 5)
    .sort((a, b) => b.conversion - a.conversion || a.model.localeCompare(b.model))[0];
  return para(
    `${top[0]!.model} drives the most revenue for ${ctx.label} in ${ctx.period}: ${formatInr(top[0]!.revenue)} from ${plural(top[0]!.delivered, 'delivery', 'deliveries')}, ${formatPct(top[0]!.revenue / revenue)} of ${formatInr(revenue)} delivered.`,
    `By delivered revenue:\n${bullets(top.map((r) => `${r.model}: ${formatInr(r.revenue)} (${r.delivered} delivered, ${r.leads} leads, ${formatPct(r.conversion)} Lead → order)`))}`,
    converter && `Best converting model with 5+ leads: ${converter.model} at ${formatPct(converter.conversion)} Lead → order.`,
  );
}

function pipeline(ctx: Ctx): string {
  const { store, scope } = ctx;
  const open = scopedLeads(store, scope).filter((l) => l.isOpen);
  const asOf = formatDate(store.asOf);
  if (open.length === 0) return `${ctx.Label} has no open leads as of ${asOf}.`;
  const cold = open.filter(isColdLead);
  const hot = cold.filter((l) => l.effectiveStatus === 'test_drive' || l.effectiveStatus === 'negotiation');
  const unclear = open.filter((l) => l.statusUnclear).length;
  const byStage = (['new', 'contacted', 'test_drive', 'negotiation'] as const)
    .map((st) => ({ st, n: open.filter((l) => l.effectiveStatus === st).length }))
    .filter((x) => x.n > 0);
  return para(
    `As of ${asOf}, ${ctx.label} has ${plural(open.length, 'open lead')} worth ${formatInr(open.reduce((s, l) => s + l.deal_value, 0))} (booked orders are not included). ${
      cold.length > 0
        ? `${cold.length} of them are cold (no activity for ${COLD_LEAD_DAYS}+ days), worth ${formatInr(cold.reduce((s, l) => s + l.deal_value, 0))}${hot.length > 0 ? `, and ${hot.length} of those are already at test drive or negotiation` : ''}.`
        : 'None of them is cold.'
    }`,
    `By stage: ${byStage.map((x) => `${STATUS_LABEL[x.st]} ${x.n}`).join(', ')}.${
      unclear > 0 ? ` ${unclear} of these are status unclear (marked lost with no loss recorded) — confirm status.` : ''
    }`,
    cold.length > 0 && 'Next step: call the cold leads today, starting with the ones in negotiation.',
  );
}

const ANSWERS: Record<CuratedId, (ctx: Ctx) => string> = {
  attention,
  target,
  losing,
  stuck,
  officers,
  sources,
  delays,
  models,
  pipeline,
};

export function answerCurated(store: DataStore, range: MonthRange, scope: Scope, id: CuratedId): string {
  const label = scope.branchId || scope.repId ? scopeLabel(store, scope) : 'the group';
  const ctx: Ctx = { store, range, scope, period: periodLabel(range), label, Label: label.charAt(0).toUpperCase() + label.slice(1) };
  return ANSWERS[id](ctx);
}

export interface OfflineAnswer {
  answer: string;
  matched: CuratedId | null;
}

/** Answers a typed question with the closest curated one, or lists what can be asked. */
export function offlineAnswer(store: DataStore, range: MonthRange, scope: Scope, question: string): OfflineAnswer {
  const matched = matchCurated(question);
  if (matched) return { answer: answerCurated(store, range, scope, matched), matched };
  return {
    answer: para(
      "I can't answer that one offline. These are the questions I can answer from the dashboard data:",
      bullets(CURATED_QUESTIONS.map((q) => q.question)),
    ),
    matched: null,
  };
}
