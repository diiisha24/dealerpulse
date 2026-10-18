import type { DataStore, EnrichedLead } from './data';
import { SOURCE_LABEL, formatDate, formatInr, formatMonth, formatPct, plural } from './format';
import { GLOSSARY } from './glossary';
import { buildAlerts, sortAlerts, type Alert } from './insights';
import {
  bookingAges,
  bookings,
  branchRows,
  cohort,
  contactSpeedBuckets,
  delayReasons,
  funnel,
  lostReasons,
  median,
  pastPromised,
  ratio,
  repRows,
  scopedDeliveries,
  slowestDeliveryDays,
  sourcePerformance,
  statusUnclearLeads,
  summarize,
  type Scope,
  type Summary,
} from './metrics';
import { inRange } from './range';
import { STUCK_ORDER_DAYS } from './thresholds';
import type { FunnelStage, MonthRange } from './types';
import { FUNNEL_STAGES } from './types';

/**
 * A compact, plain-text briefing of the dataset for one range and scope. It is
 * the only thing the AI sees, so it holds aggregates, IDs and staff names only:
 * no customer names, no phone numbers.
 *
 * It must be byte-stable for a given range and scope (it is prompt-cached), so
 * nothing here reads the clock and every list has a fixed sort order.
 */

const STAGE_LABEL: Record<FunnelStage, string> = {
  new: 'New',
  contacted: 'Contacted',
  test_drive: 'Test drive',
  negotiation: 'Negotiation',
  order_placed: 'Order placed',
  delivered: 'Delivered',
};

const DAY_MS = 86_400_000;

export function periodLabel(range: MonthRange): string {
  return range.from === range.to
    ? formatMonth(range.from)
    : `${formatMonth(range.from, range.from.slice(0, 4) === range.to.slice(0, 4))}–${formatMonth(range.to)}`;
}

/** Display name for a scope, e.g. "Lakeside Toyota" or "Meera Menon (Downtown Toyota)". */
export function scopeLabel(store: DataStore, scope: Scope): string {
  if (scope.repId) {
    const rep = store.repById.get(scope.repId);
    const branch = rep ? store.branchById.get(rep.branch_id) : undefined;
    return rep ? `${rep.name}${branch ? ` (${branch.name})` : ''}` : scope.repId;
  }
  if (scope.branchId) return store.branchById.get(scope.branchId)?.name ?? scope.branchId;
  return 'Whole group';
}

/** The same alert set each page shows for this scope, most urgent first. */
export function alertsForScope(store: DataStore, range: MonthRange, scope: Scope): Alert[] {
  if (scope.repId) {
    const rep = store.repById.get(scope.repId);
    const peerAlerts = rep
      ? buildAlerts(store, range, { branchId: rep.branch_id }).filter((a) => a.repId === scope.repId)
      : [];
    return sortAlerts([...buildAlerts(store, range, { repId: scope.repId }), ...peerAlerts]);
  }
  if (scope.branchId) return buildAlerts(store, range, { branchId: scope.branchId });
  return buildAlerts(store, range, {}, { rollUpBranches: true });
}

const fmtDays = (n: number): string => (Number.isFinite(n) ? `${n.toFixed(1)} d` : '–');
const fmtHours = (n: number): string => (Number.isFinite(n) ? `${Math.round(n)} h` : '–');

function table(headers: string[], rows: string[][]): string {
  if (rows.length === 0) return '(none)';
  const line = (cells: string[]) => `| ${cells.join(' | ')} |`;
  return [line(headers), line(headers.map(() => '---')), ...rows.map(line)].join('\n');
}

function summaryCells(s: Summary): string[] {
  return [
    String(s.units),
    s.targetUnits === null ? '–' : String(s.targetUnits),
    formatPct(s.unitAttainment),
    formatInr(s.revenue),
    s.targetRevenue === null ? '–' : formatInr(s.targetRevenue),
    formatPct(s.conversion),
    formatPct(s.lossRate),
    fmtDays(s.avgDaysToDeliver),
    `${formatInr(s.openPipelineValue)} (${s.openLeads})`,
    String(s.coldLeads),
    String(s.stuckOrders),
  ];
}

const SUMMARY_HEADERS = [
  'Units',
  'Unit target',
  'Unit attainment',
  'Revenue',
  'Revenue target',
  'Lead → order',
  'Leads lost',
  'Days to deliver',
  'Open pipeline (leads)',
  'Cold leads',
  'Stuck orders',
];

/** First time a lead entered each funnel stage ("new" falls back to creation time). */
function stageTimes(lead: EnrichedLead): Map<FunnelStage, number> {
  const times = new Map<FunnelStage, number>([['new', Date.parse(lead.created_at)]]);
  for (const event of lead.status_history) {
    if (event.status === 'lost') continue;
    const stage = event.status;
    if (stage !== 'new' && !times.has(stage)) times.set(stage, Date.parse(event.timestamp));
  }
  return times;
}

export interface VelocityRow {
  from: FunnelStage;
  to: FunnelStage;
  medianDays: number;
  leads: number;
}

/** Median days between consecutive stages, for leads that reached both. */
export function stageVelocity(leads: EnrichedLead[]): VelocityRow[] {
  const all = leads.map(stageTimes);
  const rows: VelocityRow[] = [];
  for (let i = 1; i < FUNNEL_STAGES.length; i += 1) {
    const from = FUNNEL_STAGES[i - 1]!;
    const to = FUNNEL_STAGES[i]!;
    const gaps: number[] = [];
    for (const times of all) {
      const a = times.get(from);
      const b = times.get(to);
      if (a !== undefined && b !== undefined && b >= a) gaps.push((b - a) / DAY_MS);
    }
    rows.push({ from, to, medianDays: median(gaps), leads: gaps.length });
  }
  return rows;
}

export interface ModelRow {
  model: string;
  leads: number;
  conversion: number;
  delivered: number;
  revenue: number;
}

/** Leads and conversion by model for the cohort; deliveries and revenue by delivery date in range. */
export function modelPerformance(store: DataStore, scope: Scope, range: MonthRange): ModelRow[] {
  const rows = new Map<string, { leads: EnrichedLead[]; delivered: number; revenue: number }>();
  const row = (model: string) => {
    let r = rows.get(model);
    if (!r) {
      r = { leads: [], delivered: 0, revenue: 0 };
      rows.set(model, r);
    }
    return r;
  };
  for (const lead of cohort(store, scope, range)) row(lead.model_interested).leads.push(lead);
  for (const d of scopedDeliveries(store, scope)) {
    if (!inRange(d.deliveryMonth, range)) continue;
    const model = store.leadById.get(d.lead_id)?.model_interested;
    if (!model) continue;
    const r = row(model);
    r.delivered += 1;
    r.revenue += d.dealValue;
  }
  return [...rows.entries()]
    .map(([model, r]) => ({
      model,
      leads: r.leads.length,
      conversion: ratio(r.leads.filter((l) => l.reached.has('order_placed')).length, r.leads.length),
      delivered: r.delivered,
      revenue: r.revenue,
    }))
    .sort((a, b) => b.revenue - a.revenue || b.leads - a.leads || a.model.localeCompare(b.model));
}

/** The dashboard's two actions for a stuck order (see the stuck alerts in `insights.ts`). */
export const CHASE_LABEL = 'Chase delivery';
export const VERIFY_LABEL = 'Likely cancelled — verify';

export interface StuckOrder {
  leadId: string;
  model: string;
  branch: string;
  rep: string;
  days: number;
  value: number;
  pastPromised: boolean;
  /** Older than the slowest delivery on record, so likely cancelled. */
  likelyCancelled: boolean;
}

/** Booked orders still undelivered after the stuck threshold, oldest first, split chase / verify. */
export function stuckOrders(store: DataStore, scope: Scope): StuckOrder[] {
  const slowest = slowestDeliveryDays(store);
  return bookings(store, scope)
    .filter((b) => b.age > STUCK_ORDER_DAYS)
    .sort((a, b) => b.age - a.age || a.lead.id.localeCompare(b.lead.id))
    .map(({ lead, age, pastPromised: late }) => ({
      leadId: lead.id,
      model: lead.model_interested,
      branch: store.branchById.get(lead.branch_id)?.name ?? lead.branch_id,
      rep: store.repById.get(lead.assigned_to)?.name ?? lead.assigned_to,
      days: age,
      value: lead.deal_value,
      pastPromised: late,
      likelyCancelled: age > slowest,
    }));
}

/**
 * One sentence on leads that never got a first call, using the glossary's two labels:
 * "Never contacted" (all of them) and "Closed without a call" (the ones closed as lost).
 */
export function neverContactedSentence(store: DataStore, scope: Scope, range: MonthRange): string | null {
  const s = summarize(store, scope, range);
  if (s.neverContactedTotal === 0) return null;
  const orders = contactSpeedBuckets(cohort(store, scope, range))[0]?.orders ?? 0;
  const overdue =
    s.neverContactedOverdue > 0
      ? ` ${plural(s.neverContactedOverdue, 'is', 'are')} still new and overdue for a call.`
      : '';
  return `${plural(s.neverContactedTotal, 'lead')} never got a first call (${GLOSSARY.never_contacted.label}); ${s.closedWithoutCall} of them ${
    s.closedWithoutCall === 1 ? 'was' : 'were'
  } closed as lost (${GLOSSARY.closed_without_call.label}), and ${orders === 0 ? 'none' : orders} reached an order.${overdue}`;
}

/** How many times the period's group unit target is larger than what was delivered. */
export function targetMultiple(store: DataStore, range: MonthRange): number {
  const s = summarize(store, {}, range);
  return s.targetUnits !== null && s.units > 0 ? s.targetUnits / s.units : NaN;
}

function glossary(): string {
  // Object.values keeps the declaration order of GLOSSARY, so this is stable.
  return [
    '## Glossary (exact labels used in the dashboard)',
    ...Object.values(GLOSSARY).map((g) => `- ${g.label}: ${g.definition}`),
    `- Funnel stages, in order: ${FUNNEL_STAGES.map((s) => STAGE_LABEL[s]).join(' → ')}. Lost is an exit, not a stage.`,
  ].join('\n');
}

/** Builds the fact sheet. Deterministic: same store, range and scope give the same string. */
export function buildFactSheet(store: DataStore, range: MonthRange, scope: Scope = {}): string {
  const out: string[] = [];
  const asOf = formatDate(store.asOf);
  const group = summarize(store, {}, range);
  const focus = scope.repId || scope.branchId ? summarize(store, scope, range) : group;
  const focusLabel = scopeLabel(store, scope);
  const multiple = targetMultiple(store, range);

  out.push('# DealerPulse fact sheet');
  out.push(
    [
      `- Dealership group: ${store.branches.length} Toyota branches, ${store.reps.filter((r) => r.role === 'sales_officer').length} sales officers.`,
      `- Period: ${periodLabel(range)} (${formatDate(`${range.from}-01`)} to ${formatDate(lastDayOfMonth(range.to))}).`,
      `- Data available: ${formatMonth(store.months[0] ?? '')} to ${formatMonth(store.months[store.months.length - 1] ?? '')}.`,
      `- As of (treat as today): ${asOf}. "Right now" figures (open pipeline, cold leads, stuck orders) are as of this date and ignore the period.`,
      `- Focus: ${focusLabel}.`,
      '- All money is INR. Cr = crore (10,000,000), L = lakh (100,000).',
    ].join('\n'),
  );

  out.push(glossary());

  if (Number.isFinite(multiple)) {
    const allMonths = { from: store.months[0] ?? range.from, to: store.months[store.months.length - 1] ?? range.to };
    const overall = targetMultiple(store, allMonths);
    out.push(
      [
        '## Target realism',
        `Group unit targets for the period are about ${multiple.toFixed(1)}× the units actually delivered (${group.targetUnits} target vs ${group.units} delivered)${
          Number.isFinite(overall) && (range.from !== allMonths.from || range.to !== allMonths.to)
            ? `; across all months it is about ${overall.toFixed(1)}×`
            : ''
        }. Every branch is far below target, so compare branches with each other rather than with the target alone.`,
      ].join('\n'),
    );
  }

  out.push(
    [
      '## Group summary',
      table(['Scope', ...SUMMARY_HEADERS], [['Group', ...summaryCells(group)]]),
      `Group leads created: ${group.leads}, of which lost: ${Math.round(group.lossRate * group.leads) || 0}. Orders booked in period: ${group.orders}. Avg deal value: ${formatInr(group.avgDealValue)}. Deliveries without delay: ${formatPct(group.onTimeRate)}. First contact (median): ${fmtHours(group.medianFirstContactHours)}. ${GLOSSARY.never_contacted.label} (of leads created in the period): ${group.neverContactedTotal}. ${GLOSSARY.closed_without_call.label}: ${group.closedWithoutCall}. Never contacted, still new and overdue: ${group.neverContactedOverdue}. Status unclear (confirm status): ${group.statusUnclear}. Stuck order value: ${formatInr(group.stuckOrderValue)}.`,
      neverContactedSentence(store, {}, range),
    ]
      .filter(Boolean)
      .join('\n'),
  );

  const branches = branchRows(store, range);
  out.push(
    [
      '## Branches',
      table(
        ['Branch', 'City', 'Leads', ...SUMMARY_HEADERS],
        branches.map((b) => [b.name, b.city, String(b.summary.leads), ...summaryCells(b.summary)]),
      ),
    ].join('\n'),
  );

  // Officers for the focus branch, or for the whole group.
  const officerBranch = scope.repId ? store.repById.get(scope.repId)?.branch_id : scope.branchId;
  const officers = repRows(store, officerBranch, range)
    .filter((r) => r.role === 'sales_officer')
    .sort((a, b) => b.summary.revenue - a.summary.revenue || b.summary.leads - a.summary.leads || a.repId.localeCompare(b.repId));
  out.push(
    [
      `## Sales officers${officerBranch ? ` at ${store.branchById.get(officerBranch)?.name ?? officerBranch}` : ''} (sorted by delivered revenue)`,
      table(
        ['Officer', 'ID', 'Branch', 'Units', 'Revenue', 'New leads', 'Lead → order', 'Below peers', 'Leads lost', 'First contact', 'Open', 'Cold', 'Stuck orders'],
        officers.map((r) => [
          r.name,
          r.repId,
          store.branchById.get(r.branchId)?.name ?? r.branchId,
          String(r.summary.units),
          formatInr(r.summary.revenue),
          String(r.summary.leads),
          formatPct(r.summary.conversion),
          r.belowPeers ? `yes (peers ${formatPct(r.peerConversion)})` : 'no',
          formatPct(r.summary.lossRate),
          fmtHours(r.summary.medianFirstContactHours),
          String(r.summary.openLeads),
          String(r.summary.coldLeads),
          String(r.summary.stuckOrders),
        ]),
      ),
    ].join('\n'),
  );

  if (scope.repId || scope.branchId) {
    out.push(
      [
        `## Focus summary: ${focusLabel}`,
        table(['Scope', ...SUMMARY_HEADERS], [[focusLabel, ...summaryCells(focus)]]),
        `Leads created: ${focus.leads}, of which lost: ${Math.round(focus.lossRate * focus.leads) || 0}. Orders booked in period: ${focus.orders}. First contact (median): ${fmtHours(focus.medianFirstContactHours)}. ${GLOSSARY.never_contacted.label}: ${focus.neverContactedTotal}. ${GLOSSARY.closed_without_call.label}: ${focus.closedWithoutCall}. Never contacted, still new and overdue: ${focus.neverContactedOverdue}. Status unclear (confirm status): ${focus.statusUnclear}.`,
        neverContactedSentence(store, scope, range),
      ]
        .filter(Boolean)
        .join('\n'),
    );
  }

  const leads = cohort(store, scope, range);
  const deliveries = scopedDeliveries(store, scope).filter((d) => inRange(d.deliveryMonth, range));

  out.push(
    [
      `## Funnel for ${focusLabel} (leads created in the period)`,
      table(
        ['Stage', 'Leads reached', 'Of all leads', 'From previous stage', 'Lost at this stage'],
        funnel(leads).map((f) => [
          STAGE_LABEL[f.stage],
          String(f.count),
          formatPct(f.ofTotal),
          formatPct(f.fromPrevious),
          String(f.lostHere),
        ]),
      ),
    ].join('\n'),
  );

  out.push(
    [
      `## Lost reasons for ${focusLabel}`,
      table(['Reason', 'Leads', 'Share'], lostReasons(leads).map((r) => [r.label, String(r.count), formatPct(r.share)])),
    ].join('\n'),
  );

  const delayed = delayReasons(deliveries);
  out.push(
    [
      `## Delivery delays for ${focusLabel} (deliveries in the period)`,
      `${delayed.reduce((s, r) => s + r.count, 0)} of ${deliveries.length} deliveries were delayed.`,
      table(['Delay reason', 'Deliveries', 'Share of delays'], delayed.map((r) => [r.label, String(r.count), formatPct(r.share)])),
    ].join('\n'),
  );

  out.push(
    [
      `## Lead sources for ${focusLabel}`,
      table(
        ['Source', 'Leads', 'Lead → order', 'Delivered revenue'],
        sourcePerformance(leads)
          .sort((a, b) => b.leads - a.leads || a.source.localeCompare(b.source))
          .map((r) => [SOURCE_LABEL[r.source], String(r.leads), formatPct(r.conversion), formatInr(r.revenue)]),
      ),
    ].join('\n'),
  );

  out.push(
    [
      `## Models for ${focusLabel}`,
      table(
        ['Model', 'Leads', 'Lead → order', 'Delivered', 'Revenue'],
        modelPerformance(store, scope, range).map((m) => [
          m.model,
          String(m.leads),
          formatPct(m.conversion),
          String(m.delivered),
          formatInr(m.revenue),
        ]),
      ),
    ].join('\n'),
  );

  out.push(
    [
      `## Stage velocity for ${focusLabel} (median days between stages)`,
      table(
        ['From', 'To', 'Median days', 'Leads measured'],
        stageVelocity(leads).map((v) => [STAGE_LABEL[v.from], STAGE_LABEL[v.to], fmtDays(v.medianDays), String(v.leads)]),
      ),
    ].join('\n'),
  );

  const stuck = stuckOrders(store, scope);
  const verify = stuck.filter((o) => o.likelyCancelled);
  const chase = stuck.filter((o) => !o.likelyCancelled);
  const late = pastPromised(store, scope);
  const sum = (list: StuckOrder[]) => formatInr(list.reduce((s, o) => s + o.value, 0));
  out.push(
    [
      `## Booked orders for ${focusLabel} (booked, not yet delivered, as of ${asOf})`,
      `${late.total} booked and undelivered; ${late.count} past their promised date (${formatInr(late.value)}). Slowest delivery on record: ${slowestDeliveryDays(store)} days.`,
      `Stuck (over ${STUCK_ORDER_DAYS} days): ${stuck.length} (${sum(stuck)}). ${CHASE_LABEL}: ${chase.length} (${sum(chase)}). ${VERIFY_LABEL}: ${verify.length} (${sum(verify)}), older than the slowest delivery.`,
      `By age: ${bookingAges(store, scope).map((b) => `${b.label} ${b.count}`).join(', ')}.`,
      table(
        ['Lead ID', 'Model', 'Branch', 'Officer', 'Days since order', 'Past promised', 'Value', 'Action'],
        stuck.map((o) => [
          o.leadId,
          o.model,
          o.branch,
          o.rep,
          String(o.days),
          o.pastPromised ? 'yes' : 'no',
          formatInr(o.value),
          o.likelyCancelled ? VERIFY_LABEL : CHASE_LABEL,
        ]),
      ),
    ].join('\n'),
  );

  const unclear = statusUnclearLeads(store, scope).sort((a, b) => a.id.localeCompare(b.id));
  out.push(
    [
      `## Status unclear for ${focusLabel} (marked lost, no loss recorded — confirm status)`,
      unclear.length === 0
        ? '(none)'
        : `${unclear.length} leads, counted as open at their last recorded stage: ${unclear.map((l) => l.id).join(', ')}.`,
    ].join('\n'),
  );

  const alerts = alertsForScope(store, range, scope);
  out.push(
    [
      `## Current alerts for ${focusLabel} (most urgent first)`,
      alerts.length === 0
        ? '(none)'
        : alerts.map((a, i) => `${i + 1}. [${a.severity}] ${a.title}. Impact: ${a.impact}.`).join('\n'),
    ].join('\n'),
  );

  return `${out.join('\n\n')}\n`;
}

function lastDayOfMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y ?? 1970, m ?? 1, 0));
  return d.toISOString().slice(0, 10);
}
