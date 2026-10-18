import type { DataStore, EnrichedLead } from './data';
import { formatInr, formatPct, plural, STATUS_LABEL } from './format';
import {
  COLD_LEAD_DAYS,
  NEVER_CONTACTED_HOURS,
  STUCK_ORDER_DAYS,
  bookingAges,
  bookings,
  branchRows,
  cohort,
  contactSpeedBuckets,
  delayReasons,
  isColdLead,
  leadAgeHours,
  neverContactedBreakdown,
  median,
  ratio,
  repRows,
  slowestDeliveryDays,
  scopedDeliveries,
  scopedLeads,
  statusUnclearLeads,
  summarize,
  type Scope,
} from './metrics';
import { inRange } from './range';
import type { LeadStatus, MonthRange } from './types';

export type Severity = 'critical' | 'warning' | 'info';

export type AlertKind =
  | 'cold_leads'
  | 'never_contacted'
  | 'never_contacted_process'
  | 'stuck_orders'
  | 'stuck_verify'
  | 'target_gap'
  | 'loss_anomaly'
  | 'rep_conversion'
  | 'slow_response'
  | 'delivery_delay'
  | 'status_unclear'
  | 'data_quality';

export interface AlertLead {
  id: string;
  customer: string;
  model: string;
  status: LeadStatus;
  repName: string;
  days: number;
  value: number;
  /** Promised handover date (expected close, YYYY-MM-DD). Set on stuck-order kinds. */
  promised?: string;
}

export interface Alert {
  id: string;
  kind: AlertKind;
  severity: Severity;
  title: string;
  detail: string;
  /** The concrete next step for the owner. */
  action: string;
  /** Short impact figure shown on the card, e.g. "INR 2.1 Cr at risk". */
  impact: string;
  /** Used to rank alerts of the same severity. */
  weight: number;
  branchId?: string;
  repId?: string;
  /**
   * Who acts on it: the rep for rep alerts, the branch manager for branch alerts.
   * Undefined for group-wide (rolled-up) alerts.
   */
  owner?: AlertOwner;
  leads: AlertLead[];
}

export interface AlertOwner {
  repId: string;
  name: string;
  role: 'branch_manager' | 'sales_officer';
}

function ownerFor(store: DataStore, alert: Alert): AlertOwner | undefined {
  const person = alert.repId
    ? store.repById.get(alert.repId)
    : alert.branchId
      ? store.reps.find((r) => r.branch_id === alert.branchId && r.role === 'branch_manager')
      : undefined;
  return person ? { repId: person.id, name: person.name, role: person.role } : undefined;
}

export const KIND_LABEL: Record<AlertKind, string> = {
  cold_leads: 'Leads going cold',
  never_contacted: 'Never contacted',
  never_contacted_process: 'Closed without a call',
  stuck_orders: 'Chase delivery',
  stuck_verify: 'Likely cancelled',
  target_gap: 'Behind target',
  loss_anomaly: 'Unusual loss rate',
  rep_conversion: 'Rep conversion',
  slow_response: 'Slow first response',
  delivery_delay: 'Delivery delays',
  status_unclear: 'Status unclear',
  data_quality: 'Data hygiene',
};

const SEVERITY_ORDER: Record<Severity, number> = { critical: 0, warning: 1, info: 2 };
const HOT_STAGES: readonly LeadStatus[] = ['test_drive', 'negotiation'];

function toAlertLead(store: DataStore, lead: EnrichedLead, days: number, promised?: string): AlertLead {
  const row: AlertLead = {
    id: lead.id,
    customer: lead.customer_name,
    model: lead.model_interested,
    status: lead.effectiveStatus,
    repName: store.repById.get(lead.assigned_to)?.name ?? lead.assigned_to,
    days,
    value: lead.deal_value,
  };
  if (promised !== undefined) row.promised = promised;
  return row;
}

/** "The lead is already at…", "All 3 are already at…", "2 of 5 are already at…" or "None has reached…". */
function hotLine(hot: number, total: number): string {
  if (hot === 0) return total === 1 ? 'It has not reached a test drive yet.' : 'None has reached a test drive yet.';
  if (total === 1) return 'The lead is already at test drive or negotiation.';
  if (hot === total) return `All ${total} are already at test drive or negotiation.`;
  return `${hot} of ${total} ${hot === 1 ? 'is' : 'are'} already at test drive or negotiation.`;
}

function callAction(n: number): string {
  return n === 1 ? 'Call this customer today.' : 'Call these customers today, oldest first.';
}

function coldLeadAlerts(store: DataStore, scope: Scope): Alert[] {
  const alerts: Alert[] = [];
  for (const branch of store.branches) {
    if (scope.branchId && branch.id !== scope.branchId) continue;
    const cold = scopedLeads(store, { ...scope, branchId: branch.id })
      .filter(isColdLead)
      .sort((a, b) => b.daysSinceActivity - a.daysSinceActivity);
    if (cold.length === 0) continue;

    const hot = cold.filter((l) => HOT_STAGES.includes(l.effectiveStatus));
    const value = cold.reduce((s, l) => s + l.deal_value, 0);
    const oldest = cold[0]!.daysSinceActivity;
    alerts.push({
      id: `cold-${branch.id}${scope.repId ? `-${scope.repId}` : ''}`,
      kind: 'cold_leads',
      severity: hot.length > 0 ? 'critical' : 'warning',
      title: `${plural(cold.length, 'open lead')} in ${branch.name} untouched for ${COLD_LEAD_DAYS}+ days`,
      detail: `${hotLine(hot.length, cold.length)} ${
        cold.length === 1 ? 'It has' : 'The oldest has'
      } had no activity for ${plural(oldest, 'day')}.`,
      action: callAction(cold.length),
      impact: `${formatInr(value)} in play`,
      weight: value,
      branchId: branch.id,
      repId: scope.repId,
      leads: cold.map((l) => toAlertLead(store, l, l.daysSinceActivity)),
    });
  }
  return alerts;
}

/** "Of 119 leads never contacted, 0 reached an order." for the scope and range. */
function neverContactedFact(store: DataStore, scope: Scope, range: MonthRange): string {
  const never = contactSpeedBuckets(cohort(store, scope, range))[0];
  if (!never || never.leads === 0) return '';
  return `Of ${plural(never.leads, 'lead')} never contacted, ${never.orders} reached an order.`;
}

/**
 * Share-of-leads-never-contacted line for each branch whose share is at least
 * 1.5x the rest of the group's, e.g. "Lakeside never contacts {share} of its leads, against {rest} at other branches."
 */
interface NeverShare {
  branchId: string;
  share: number;
  restShare: number;
  line: string;
}

function neverContactedShares(store: DataStore, range: MonthRange, onlyBranchId?: string): NeverShare[] {
  const group = cohort(store, {}, range);
  const out: NeverShare[] = [];
  for (const branch of store.branches) {
    if (onlyBranchId && branch.id !== onlyBranchId) continue;
    const mine = group.filter((l) => l.branch_id === branch.id);
    const rest = group.filter((l) => l.branch_id !== branch.id);
    const share = ratio(mine.filter((l) => l.firstContactHours === null).length, mine.length);
    const restShare = ratio(rest.filter((l) => l.firstContactHours === null).length, rest.length);
    if (mine.length < 10 || !(restShare > 0) || !(share >= restShare * 1.5)) continue;
    out.push({
      branchId: branch.id,
      share,
      restShare,
      line: `${branch.name} never contacts ${formatPct(share)} of its leads, against ${formatPct(restShare)} at other branches.`,
    });
  }
  return out;
}

function neverContactedShareLines(store: DataStore, range: MonthRange, onlyBranchId?: string): string[] {
  return neverContactedShares(store, range, onlyBranchId).map((s) => s.line);
}

const NEVER_PROCESS_ACTION = 'Set a same-day first-call rule and review how new leads are assigned.';

/**
 * Two cards per branch:
 * - `never_contacted`: open leads still "new" NEVER_CONTACTED_HOURS+ after creation. Call them today.
 * - `never_contacted_process`: leads closed as lost without a first call. A process problem, not a call list.
 */
function neverContactedAlerts(store: DataStore, range: MonthRange, scope: Scope): Alert[] {
  const alerts: Alert[] = [];
  const suffix = (id: string) => `${id}${scope.repId ? `-${scope.repId}` : ''}`;
  for (const branch of store.branches) {
    if (scope.branchId && branch.id !== scope.branchId) continue;
    const branchScope = { ...scope, branchId: branch.id };
    // Status-unclear and under-48 h leads are left out here: they have their own card or are not overdue yet.
    const breakdown = neverContactedBreakdown(store, cohort(store, branchScope, range));
    const withAge = (list: EnrichedLead[]) =>
      list
        .map((l) => ({ lead: l, ageDays: Math.floor(leadAgeHours(store, l) / 24) }))
        .sort((a, b) => b.ageDays - a.ageDays);
    const fact = neverContactedFact(store, branchScope, range);

    const open = withAge(breakdown.openActionable);
    if (open.length > 0) {
      const value = open.reduce((s, x) => s + x.lead.deal_value, 0);
      alerts.push({
        id: `never-${suffix(branch.id)}`,
        kind: 'never_contacted',
        severity: open.some((x) => x.ageDays >= COLD_LEAD_DAYS) ? 'critical' : 'warning',
        title: `${plural(open.length, 'new lead')} in ${branch.name} not contacted after ${NEVER_CONTACTED_HOURS} h`,
        detail: [`Never contacted: still 'new' ${NEVER_CONTACTED_HOURS} hours after it was created.`, fact]
          .filter(Boolean)
          .join(' '),
        action: 'Call these customers today, oldest first.',
        impact: `${formatInr(value)} in play`,
        weight: value,
        branchId: branch.id,
        repId: scope.repId,
        leads: open.map((x) => toAlertLead(store, x.lead, x.ageDays)),
      });
    }

    const closed = withAge(breakdown.closed);
    if (closed.length > 0) {
      const share = scope.repId ? undefined : neverContactedShares(store, range, branch.id)[0];
      const value = closed.reduce((s, x) => s + x.lead.deal_value, 0);
      alerts.push({
        id: `never-process-${suffix(branch.id)}`,
        kind: 'never_contacted_process',
        severity: 'warning',
        title: share
          ? `${branch.name} never called ${formatPct(share.share)} of its leads`
          : `${plural(closed.length, 'lead')} in ${branch.name} ${closed.length === 1 ? 'was' : 'were'} closed without a first call`,
        detail: [
          `${plural(closed.length, 'lead')} closed without a first call.`,
          fact,
          share?.line ?? '',
        ]
          .filter(Boolean)
          .join(' '),
        action: NEVER_PROCESS_ACTION,
        impact: `${formatInr(value)} never called`,
        weight: value,
        branchId: branch.id,
        repId: scope.repId,
        leads: closed.map((x) => toAlertLead(store, x.lead, x.ageDays)),
      });
    }
  }
  return alerts;
}

/** Contact-speed finding computed from contactSpeedBuckets(): fastest vs slowest bucket, then never contacted. */
function contactSpeedLine(store: DataStore, range: MonthRange): string {
  const buckets = contactSpeedBuckets(cohort(store, {}, range));
  const [never, ...timed] = buckets;
  const seen = timed.filter((b) => b.leads > 0);
  const fastest = seen[0];
  const slowest = seen[seen.length - 1];
  const parts: string[] = [];
  if (fastest && slowest && fastest !== slowest) {
    const verdict =
      slowest.conversion >= fastest.conversion
        ? 'In this data, first-contact speed does not predict orders'
        : 'Faster first contact converts better here';
    parts.push(
      `${verdict}: leads first contacted ${fastest.label.toLowerCase()} convert ${formatPct(fastest.conversion)}, and those contacted at ${slowest.label} convert ${formatPct(slowest.conversion)}.`,
    );
  }
  if (never && never.leads > 0) {
    parts.push(`Leads never contacted convert ${formatPct(never.conversion)}.`);
  }
  return parts.join(' ');
}

const CHASE_ACTION = 'Check allocation and finance status for each order and give the customer a firm date.';
const VERIFY_ACTION =
  'Call each customer to confirm the order is still on, then cancel it in the CRM or set a new delivery date.';

function typicalDeliveryDays(store: DataStore): number {
  return Math.round(median(store.deliveries.map((d) => d.days_to_deliver)));
}

/** "12 of 14 are past their promised date." computed from the card's leads. */
function promisedLine(store: DataStore, leads: AlertLead[]): string {
  const today = store.asOf.slice(0, 10);
  const late = leads.filter((l) => l.promised !== undefined && l.promised < today).length;
  if (late === 0) return 'None is past its promised date yet.';
  if (leads.length === 1) return 'It is past its promised date.';
  return `${late} of ${leads.length} are past their promised date.`;
}

/** Booking-age buckets for the card's scope, e.g. "Bookings by age: ≤30 d 14, 31–60 d 9, …". */
function agesLine(store: DataStore, scope: Scope): string {
  return `Bookings by age: ${bookingAges(store, scope)
    .map((b) => `${b.label} ${b.count}`)
    .join(', ')}.`;
}

function verifyRange(leads: AlertLead[]): string {
  const ages = leads.map((l) => l.days);
  const lo = Math.min(...ages);
  const hi = Math.max(...ages);
  return lo === hi ? `${hi} days ago` : `${lo} to ${hi} days ago`;
}

function chaseDetail(store: DataStore, leads: AlertLead[], scope: Scope): string {
  return `Completed deliveries take a median of ${typicalDeliveryDays(store)} days from order. The oldest of these was booked ${
    leads[0]?.days ?? 0
  } days ago. ${promisedLine(store, leads)} ${agesLine(store, scope)}`;
}

function verifyDetail(store: DataStore, leads: AlertLead[], scope: Scope): string {
  return `Likely cancelled: a stuck order older than the slowest delivery on record (${slowestDeliveryDays(
    store,
  )} days). These were booked ${verifyRange(leads)}. ${promisedLine(store, leads)} ${agesLine(store, scope)}`;
}

function stuckOrderAlerts(store: DataStore, scope: Scope): Alert[] {
  const alerts: Alert[] = [];
  const slowest = slowestDeliveryDays(store);
  for (const branch of store.branches) {
    if (scope.branchId && branch.id !== scope.branchId) continue;
    const branchScope = { ...scope, branchId: branch.id };
    const stuck = bookings(store, branchScope).filter((b) => b.age > STUCK_ORDER_DAYS);
    const suffix = `${branch.id}${scope.repId ? `-${scope.repId}` : ''}`;

    const verify = stuck.filter((b) => b.age > slowest);
    if (verify.length > 0) {
      const leads = verify.map((b) => toAlertLead(store, b.lead, b.age, b.promised));
      const value = leads.reduce((s, l) => s + l.value, 0);
      alerts.push({
        id: `verify-${suffix}`,
        kind: 'stuck_verify',
        severity: 'warning',
        title: `${plural(verify.length, 'booked order')} in ${branch.name} likely cancelled — verify`,
        detail: verifyDetail(store, leads, branchScope),
        action: VERIFY_ACTION,
        impact: `${formatInr(value)} to verify`,
        weight: value,
        branchId: branch.id,
        repId: scope.repId,
        leads,
      });
    }

    const chase = stuck.filter((b) => b.age <= slowest);
    if (chase.length > 0) {
      const leads = chase.map((b) => toAlertLead(store, b.lead, b.age, b.promised));
      const value = leads.reduce((s, l) => s + l.value, 0);
      alerts.push({
        id: `stuck-${suffix}`,
        kind: 'stuck_orders',
        severity: chase.some((b) => b.pastPromised) ? 'critical' : 'warning',
        title: `${plural(chase.length, 'booked order')} in ${branch.name} not delivered after ${STUCK_ORDER_DAYS}+ days — chase delivery`,
        detail: chaseDetail(store, leads, branchScope),
        action: CHASE_ACTION,
        impact: `${formatInr(value)} unbilled`,
        weight: value,
        branchId: branch.id,
        repId: scope.repId,
        leads,
      });
    }
  }
  return alerts;
}

function targetGapAlerts(store: DataStore, range: MonthRange, scope: Scope): Alert[] {
  if (scope.repId) return [];
  const group = summarize(store, {}, range);
  if (!Number.isFinite(group.unitAttainment)) return [];

  return branchRows(store, range)
    .filter((b) => !scope.branchId || b.branchId === scope.branchId)
    .filter((b) => b.summary.unitAttainment < group.unitAttainment * 0.5)
    .map((b) => ({
      id: `target-${b.branchId}`,
      kind: 'target_gap' as const,
      severity: 'critical' as const,
      title: `${b.name} delivered ${formatPct(b.summary.unitAttainment)} of its unit target`,
      detail: `The group average is ${formatPct(group.unitAttainment)}. ${b.name} delivered ${b.summary.units} of ${b.summary.targetUnits} units and lost ${formatPct(b.summary.lossRate)} of its leads.`,
      action: 'Review this branch with its manager: lead quality, follow-up discipline and pricing.',
      impact: `${formatInr((b.summary.targetRevenue ?? 0) - b.summary.revenue)} revenue gap`,
      weight: (b.summary.targetRevenue ?? 0) - b.summary.revenue,
      branchId: b.branchId,
      leads: [],
    }));
}

function lossAnomalyAlerts(store: DataStore, range: MonthRange, scope: Scope): Alert[] {
  if (scope.repId) return [];
  const group = summarize(store, {}, range);
  return branchRows(store, range)
    .filter((b) => !scope.branchId || b.branchId === scope.branchId)
    .filter((b) => b.summary.leads >= 10 && b.summary.lossRate - group.lossRate >= 0.15)
    .map((b) => {
      const lost = scopedLeads(store, { branchId: b.branchId }).filter(
        (l) => l.isLost && inRange(l.createdMonth, range),
      );
      const early = lost.filter((l) => l.lostAtStage === 'new' || l.lostAtStage === 'contacted').length;
      return {
        id: `loss-${b.branchId}`,
        kind: 'loss_anomaly' as const,
        severity: 'critical' as const,
        title: `${b.name} loses ${formatPct(b.summary.lossRate)} of its leads`,
        detail: `That is ${Math.round((b.summary.lossRate - group.lossRate) * 100)} points above the group average of ${formatPct(group.lossRate)}. ${formatPct(early / Math.max(lost.length, 1))} of its losses happen before a test drive.`,
        action: 'Most leads are lost before a test drive, so audit first-call scripts and test-drive booking.',
        impact: plural(lost.length, 'lost lead'),
        weight: lost.length,
        branchId: b.branchId,
        leads: [],
      };
    });
}

function repAlerts(store: DataStore, range: MonthRange, scope: Scope): Alert[] {
  if (scope.repId) return [];
  const alerts: Alert[] = [];
  const reps = repRows(store, scope.branchId, range).filter((r) => r.role === 'sales_officer');

  const groupContact = median(
    store.leads
      .filter((l) => inRange(l.createdMonth, range))
      .map((l) => l.firstContactHours)
      .filter((h): h is number => h !== null && h >= 0),
  );
  const speedLine = contactSpeedLine(store, range);

  // repRows summarises each rep once and computes peer flags from the same rows.
  for (const rep of reps) {
    const peerConv = rep.peerConversion;
    const branchName = store.branchById.get(rep.branchId)?.name ?? rep.branchId;

    if (rep.belowPeers) {
      alerts.push({
        id: `conv-${rep.repId}`,
        kind: 'rep_conversion',
        severity: 'warning',
        title: `${rep.name} converts ${formatPct(rep.summary.conversion)} of leads to orders`,
        detail: `Other officers at ${branchName} convert ${formatPct(peerConv)}. ${rep.name} handled ${plural(rep.summary.leads, 'lead')} in this period.`,
        action: 'Pair with the branch top performer for a week and review their lost deals together.',
        impact: `${Math.round((peerConv - rep.summary.conversion) * 100)} pts below peers`,
        weight: rep.summary.leads * (peerConv - rep.summary.conversion),
        branchId: rep.branchId,
        repId: rep.repId,
        leads: [],
      });
    }

    const hours = rep.summary.medianFirstContactHours;
    if (rep.summary.leads >= 5 && Number.isFinite(groupContact) && hours > groupContact * 2 && hours >= 24) {
      alerts.push({
        id: `resp-${rep.repId}`,
        kind: 'slow_response',
        severity: 'info',
        title: `${rep.name} takes ${Math.round(hours)} hours to make first contact`,
        detail: `The group median is ${Math.round(groupContact)} hours. ${speedLine}`.trim(),
        action: 'Keep a same-day callback rule, but first make sure every new lead assigned to this rep gets a call.',
        impact: `${(hours / groupContact).toFixed(1)}x slower`,
        weight: hours,
        branchId: rep.branchId,
        repId: rep.repId,
        leads: [],
      });
    }
  }
  return alerts;
}

function joinAnd(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** Top delay causes. Ties are not ranked: "The top causes are "A" and "B" (1 each)." */
function causesLine(reasons: Array<{ label: string; count: number }>): string {
  const top = reasons[0];
  if (!top) return '';
  const tied = reasons.filter((r) => r.count === top.count);
  if (tied.length > 1) {
    const shown = tied.slice(0, 3).map((r) => `"${r.label}"`);
    const more = tied.length > 3 ? ` and ${tied.length - 3} more` : '';
    return `The top causes are ${joinAnd(shown)}${more} (${top.count} each).`;
  }
  const next = reasons.slice(1, 3);
  const nextTied = next.length === 2 && next[0]!.count === next[1]!.count;
  const after =
    next.length === 0
      ? ''
      : nextTied
        ? `, followed by "${next[0]!.label}" and "${next[1]!.label}" (${next[0]!.count} each)`
        : `, followed by ${joinAnd(next.map((r) => `"${r.label}" (${r.count})`))}`;
  return `The top cause is "${top.label}" (${top.count})${after}.`;
}

function deliveryAlerts(store: DataStore, range: MonthRange, scope: Scope): Alert[] {
  const deliveries = scopedDeliveries(store, scope).filter((d) => inRange(d.deliveryMonth, range));
  if (deliveries.length < 5) return [];
  const reasons = delayReasons(deliveries);
  const delayed = deliveries.filter((d) => d.delay_reason).length;
  const share = delayed / deliveries.length;
  const top = reasons[0];
  if (!top || share < 0.25) return [];

  return [
    {
      id: `delay-${scope.branchId ?? 'group'}${scope.repId ? `-${scope.repId}` : ''}`,
      kind: 'delivery_delay',
      severity: share >= 0.4 ? 'warning' : 'info',
      title: `${formatPct(share)} of deliveries were delayed`,
      detail: `${plural(delayed, 'delivery', 'deliveries')} out of ${deliveries.length} slipped. ${causesLine(reasons)}`,
      action: 'Confirm delivery dates with customers at booking, and escalate allocation delays to the OEM weekly.',
      impact: `${plural(delayed, 'delay')}`,
      weight: delayed,
      branchId: scope.branchId,
      repId: scope.repId,
      leads: [],
    },
  ];
}

function statusUnclearAlerts(store: DataStore, scope: Scope): Alert[] {
  const alerts: Alert[] = [];
  for (const branch of store.branches) {
    if (scope.branchId && branch.id !== scope.branchId) continue;
    const unclear = statusUnclearLeads(store, { ...scope, branchId: branch.id }).sort(
      (a, b) => b.daysSinceActivity - a.daysSinceActivity,
    );
    if (unclear.length === 0) continue;
    const value = unclear.reduce((s, l) => s + l.deal_value, 0);
    const leads = unclear.map((l) => toAlertLead(store, l, l.daysSinceActivity));
    alerts.push({
      id: `unclear-${branch.id}${scope.repId ? `-${scope.repId}` : ''}`,
      kind: 'status_unclear',
      severity: 'warning',
      title: statusUnclearTitle(unclear.length),
      detail: statusUnclearDetail(leads),
      action: STATUS_UNCLEAR_ACTION,
      impact: `${formatInr(value)} unconfirmed`,
      weight: value,
      branchId: branch.id,
      repId: scope.repId,
      leads,
    });
  }
  return alerts;
}

const STATUS_UNCLEAR_ACTION = 'Ask each rep to confirm: reopen and follow up, or record the loss reason.';

function statusUnclearTitle(n: number): string {
  return `${plural(n, 'lead')} marked lost with no loss recorded — confirm status`;
}

function statusUnclearDetail(leads: AlertLead[]): string {
  const hot = leads.filter((l) => HOT_STAGES.includes(l.status)).length;
  const n = leads.length;
  const intro =
    n === 1
      ? 'This lead has no "lost" step in its history, so we count it as open at its last recorded stage.'
      : 'These leads have no "lost" step in their history, so we count them as open at their last recorded stage.';
  const stage =
    hot === 0
      ? n === 1
        ? 'It had not reached a test drive.'
        : 'None had reached a test drive.'
      : n === 1
        ? 'It was last at test drive or negotiation.'
        : hot === n
          ? `All ${n} were last at test drive or negotiation.`
          : `${hot} of ${n} ${hot === 1 ? 'was' : 'were'} last at test drive or negotiation.`;
  return `${intro} ${stage}`;
}

function dataQualityAlerts(store: DataStore, scope: Scope): Alert[] {
  const missing = scopedLeads(store, scope).filter((l) => l.isLost && !l.lost_reason);
  if (missing.length === 0) return [];
  return [
    {
      id: `dq-${scope.branchId ?? 'group'}${scope.repId ? `-${scope.repId}` : ''}`,
      kind: 'data_quality',
      severity: 'info',
      title: `${plural(missing.length, 'lead')} closed as lost with no reason recorded`,
      detail: 'These leads have a "lost" step in their history but no lost reason, so we cannot tell why they were lost.',
      action: 'Make the lost reason a required field in the CRM.',
      impact: `${formatInr(missing.reduce((s, l) => s + l.deal_value, 0))} unexplained`,
      weight: missing.length,
      branchId: scope.branchId,
      repId: scope.repId,
      leads: missing.map((l) => toAlertLead(store, l, l.daysSinceActivity)),
    },
  ];
}

const SEVERITY_RANK: Severity[] = ['critical', 'warning', 'info'];

/**
 * Folds per-branch alerts of one kind into a single group alert so the CEO view
 * shows one card per problem instead of five near-identical ones.
 */
function rollUp(
  store: DataStore,
  alerts: Alert[],
  kind: AlertKind,
  title: (n: number, branches: number) => string,
  detail: (leads: AlertLead[], breakdown: string) => string,
  impactSuffix = 'in play',
  action?: (leads: AlertLead[]) => string,
): Alert[] {
  const parts = alerts.filter((a) => a.kind === kind);
  if (parts.length < 2) return alerts;
  const leads = parts.flatMap((a) => a.leads).sort((a, b) => b.days - a.days);
  const severity = SEVERITY_RANK.find((s) => parts.some((p) => p.severity === s)) ?? 'info';
  const value = leads.reduce((s, l) => s + l.value, 0);
  const breakdown = [...parts]
    .sort((a, b) => b.leads.length - a.leads.length)
    .map((p) => `${store.branchById.get(p.branchId ?? '')?.name.replace(' Toyota', '') ?? p.branchId} ${p.leads.length}`)
    .join(', ');
  const merged: Alert = {
    ...parts[0]!,
    id: `${kind}-group`,
    severity,
    title: title(leads.length, parts.length),
    detail: detail(leads, breakdown),
    impact: `${formatInr(value)} ${impactSuffix}`,
    action: action ? action(leads) : parts[0]!.action,
    weight: value,
    branchId: undefined,
    leads,
  };
  return [...alerts.filter((a) => a.kind !== kind), merged];
}

export interface AlertOptions {
  /** Merge per-branch lead alerts into one group alert (used on the overview). */
  rollUpBranches?: boolean;
}

/** Every alert for the scope, most urgent first. */
export function buildAlerts(store: DataStore, range: MonthRange, scope: Scope = {}, options: AlertOptions = {}): Alert[] {
  let alerts = [
    ...coldLeadAlerts(store, scope),
    ...neverContactedAlerts(store, range, scope),
    ...stuckOrderAlerts(store, scope),
    ...targetGapAlerts(store, range, scope),
    ...lossAnomalyAlerts(store, range, scope),
    ...repAlerts(store, range, scope),
    ...deliveryAlerts(store, range, scope),
    ...statusUnclearAlerts(store, scope),
    ...dataQualityAlerts(store, scope),
  ];
  if (options.rollUpBranches && !scope.branchId && !scope.repId) {
    // At most two stuck cards on the overview: one "Chase delivery", one "Likely cancelled".
    alerts = rollUp(
      store,
      alerts,
      'stuck_orders',
      (n, b) =>
        `${plural(n, 'booked order')} across ${b} branches not delivered after ${STUCK_ORDER_DAYS}+ days — chase delivery`,
      (leads, breakdown) => `By branch: ${breakdown}. ${chaseDetail(store, leads, {})}`,
      'unbilled',
    );
    alerts = rollUp(
      store,
      alerts,
      'stuck_verify',
      (n, b) => `${plural(n, 'booked order')} across ${b} branches likely cancelled — verify`,
      (leads, breakdown) => `By branch: ${breakdown}. ${verifyDetail(store, leads, {})}`,
      'to verify',
    );
    alerts = rollUp(
      store,
      alerts,
      'never_contacted',
      (n, b) => `${plural(n, 'new lead')} across ${b} branches not contacted after ${NEVER_CONTACTED_HOURS} h`,
      (_leads, breakdown) =>
        [`By branch: ${breakdown}.`, neverContactedFact(store, {}, range)].filter(Boolean).join(' '),
    );
    alerts = rollUp(
      store,
      alerts,
      'never_contacted_process',
      (n, b) => `${plural(n, 'lead')} across ${b} branches were closed without a first call`,
      (_leads, breakdown) =>
        [`By branch: ${breakdown}.`, neverContactedFact(store, {}, range), ...neverContactedShareLines(store, range)]
          .filter(Boolean)
          .join(' '),
      'never called',
    );
    alerts = rollUp(
      store,
      alerts,
      'status_unclear',
      (n) => statusUnclearTitle(n),
      (leads, breakdown) => `By branch: ${breakdown}. ${statusUnclearDetail(leads)}`,
      'unconfirmed',
    );
    alerts = rollUp(
      store,
      alerts,
      'cold_leads',
      (n, b) => `${plural(n, 'open lead')} across ${b} branches untouched for ${COLD_LEAD_DAYS}+ days`,
      (leads, breakdown) => {
        const hot = leads.filter((l) => HOT_STAGES.includes(l.status)).length;
        return `By branch: ${breakdown}. ${hotLine(hot, leads.length)}`;
      },
    );
  }
  return sortAlerts(
    // Owners are attached after roll-up, so group alerts (no branch, no rep) stay ownerless.
    alerts.map((a) => {
      const owner = ownerFor(store, a);
      return owner ? { ...a, owner } : a;
    }),
  );
}

export function sortAlerts(alerts: Alert[]): Alert[] {
  return [...alerts].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || b.weight - a.weight,
  );
}

export function statusLabel(status: LeadStatus): string {
  return STATUS_LABEL[status];
}
