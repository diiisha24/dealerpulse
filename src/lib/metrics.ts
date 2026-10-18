import type { DataStore, EnrichedDelivery, EnrichedLead } from './data';
import { inRange, monthsInRange } from './range';
import { COLD_LEAD_DAYS, NEVER_CONTACTED_HOURS, STUCK_ORDER_DAYS } from './thresholds';
import type { FunnelStage, LeadSource, MonthRange, SalesRep } from './types';
import { FUNNEL_STAGES } from './types';

/** Thresholds live in `thresholds.ts`; re-exported so existing imports keep working. */
export { COLD_LEAD_DAYS, NEVER_CONTACTED_HOURS, STUCK_ORDER_DAYS };

/** Which slice of the business a metric is computed for. Empty = whole group. */
export interface Scope {
  branchId?: string;
  repId?: string;
}

/** Open lead that has been contacted and has had no activity for COLD_LEAD_DAYS or more. */
export function isColdLead(lead: EnrichedLead): boolean {
  return lead.isOpen && lead.effectiveStatus !== 'new' && lead.daysSinceActivity >= COLD_LEAD_DAYS;
}

/** Status-unclear leads in the scope (current, not range-bound). */
export function statusUnclearLeads(store: DataStore, scope: Scope): EnrichedLead[] {
  return scopedLeads(store, scope).filter((l) => l.statusUnclear);
}

const ratio = (num: number, den: number): number => (den > 0 ? num / den : NaN);

function median(values: number[]): number {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function matchesScope(item: { branchId: string; repId: string }, scope: Scope): boolean {
  if (scope.repId && item.repId !== scope.repId) return false;
  if (scope.branchId && item.branchId !== scope.branchId) return false;
  return true;
}

export function scopedLeads(store: DataStore, scope: Scope): EnrichedLead[] {
  return store.leads.filter((l) => matchesScope({ branchId: l.branch_id, repId: l.assigned_to }, scope));
}

export function scopedDeliveries(store: DataStore, scope: Scope): EnrichedDelivery[] {
  return store.deliveries.filter((d) => matchesScope(d, scope));
}

/** Leads created inside the range (the "cohort" the funnel and conversion are based on). */
export function cohort(store: DataStore, scope: Scope, range: MonthRange): EnrichedLead[] {
  return scopedLeads(store, scope).filter((l) => inRange(l.createdMonth, range));
}

export interface Summary {
  leads: number;
  orders: number;
  units: number;
  revenue: number;
  /** null when the scope has no target (a single rep). */
  targetUnits: number | null;
  targetRevenue: number | null;
  unitAttainment: number;
  revenueAttainment: number;
  /** Share of leads created in range that reached "order placed". */
  conversion: number;
  /** Share of leads created in range with a recorded loss. Status-unclear leads are not counted. */
  lossRate: number;
  avgDealValue: number;
  avgDaysToDeliver: number;
  onTimeRate: number;
  medianFirstContactHours: number;
  /** Open leads right now (as of the dataset end), regardless of range. Includes status-unclear leads. */
  openLeads: number;
  openPipelineValue: number;
  /** Contacted open leads with no activity for COLD_LEAD_DAYS+ (excludes status "new"). */
  coldLeads: number;
  /** Leads marked lost with no "lost" step, as of the dataset end, regardless of range. */
  statusUnclear: number;
  /** Leads created in range with no "contacted" step at all (the "Never" contact-speed bucket). */
  neverContactedTotal: number;
  /** Open leads still "new" NEVER_CONTACTED_HOURS+ after creation, with no contact: call today. */
  neverContactedOverdue: number;
  /** Leads created in range that were closed as lost without a first call. */
  closedWithoutCall: number;
  /** @deprecated Use `closedWithoutCall`. Kept for one wave so existing callers compile. */
  neverContacted: number;
  stuckOrders: number;
  stuckOrderValue: number;
}

export function summarize(store: DataStore, scope: Scope, range: MonthRange): Summary {
  const leads = cohort(store, scope, range);
  const deliveries = scopedDeliveries(store, scope).filter((d) => inRange(d.deliveryMonth, range));
  const all = scopedLeads(store, scope);

  const units = deliveries.length;
  const revenue = deliveries.reduce((s, d) => s + d.dealValue, 0);

  let targetUnits: number | null = null;
  let targetRevenue: number | null = null;
  if (!scope.repId) {
    const targets = store.targets.filter(
      (t) => inRange(t.month, range) && (!scope.branchId || t.branch_id === scope.branchId),
    );
    targetUnits = targets.reduce((s, t) => s + t.target_units, 0);
    targetRevenue = targets.reduce((s, t) => s + t.target_revenue, 0);
  }

  const orders = scopedLeads(store, scope).filter(
    (l) => l.orderedAt && inRange(l.orderedAt.slice(0, 7), range),
  ).length;
  const converted = leads.filter((l) => l.reached.has('order_placed')).length;
  const lost = leads.filter((l) => l.isLost).length;

  const open = all.filter((l) => l.isOpen);
  const stuck = all.filter((l) => l.effectiveStatus === 'order_placed' && orderAgeDays(store, l) > STUCK_ORDER_DAYS);

  const never = neverContactedBreakdown(store, leads);
  const contactHours = leads
    .map((l) => l.firstContactHours)
    .filter((h): h is number => h !== null && h >= 0);

  return {
    leads: leads.length,
    orders,
    units,
    revenue,
    targetUnits,
    targetRevenue,
    unitAttainment: targetUnits === null ? NaN : ratio(units, targetUnits),
    revenueAttainment: targetRevenue === null ? NaN : ratio(revenue, targetRevenue),
    conversion: ratio(converted, leads.length),
    lossRate: ratio(lost, leads.length),
    avgDealValue: ratio(revenue, units),
    avgDaysToDeliver: ratio(
      deliveries.reduce((s, d) => s + d.days_to_deliver, 0),
      deliveries.length,
    ),
    onTimeRate: ratio(deliveries.filter((d) => !d.delay_reason).length, deliveries.length),
    medianFirstContactHours: median(contactHours),
    openLeads: open.length,
    openPipelineValue: open.reduce((s, l) => s + l.deal_value, 0),
    coldLeads: open.filter(isColdLead).length,
    statusUnclear: all.filter((l) => l.statusUnclear).length,
    neverContactedTotal: never.total,
    neverContactedOverdue: never.openActionable.length,
    closedWithoutCall: never.closed.length,
    neverContacted: never.closed.length,
    stuckOrders: stuck.length,
    stuckOrderValue: stuck.reduce((s, l) => s + l.deal_value, 0),
  };
}

export function orderAgeDays(store: DataStore, lead: EnrichedLead): number {
  if (!lead.orderedAt) return 0;
  return Math.floor((Date.parse(store.asOf) - Date.parse(lead.orderedAt)) / 86_400_000);
}

/** Hours from creation to the dataset's "as of" date. */
export function leadAgeHours(store: DataStore, lead: EnrichedLead): number {
  return (Date.parse(store.asOf) - Date.parse(lead.created_at)) / 3_600_000;
}

/**
 * Never contacted: no "contacted" step at all and created NEVER_CONTACTED_HOURS or more
 * before the "as of" date. Includes leads later closed as lost without a first call.
 */
export function isNeverContacted(store: DataStore, lead: EnrichedLead): boolean {
  return !lead.reached.has('contacted') && leadAgeHours(store, lead) >= NEVER_CONTACTED_HOURS;
}

export interface NeverContactedBreakdown {
  /** Every lead with no "contacted" step (the "Never" contact-speed bucket). */
  total: number;
  /** Open, still "new", NEVER_CONTACTED_HOURS+ old: call today. */
  openActionable: EnrichedLead[];
  /** Open, still "new", younger than NEVER_CONTACTED_HOURS: not overdue yet. */
  openFresh: EnrichedLead[];
  /** Status unclear (marked lost, no "lost" step); covered by the status-unclear card. */
  statusUnclear: EnrichedLead[];
  /** Closed as lost without a first call: the process card. */
  closed: EnrichedLead[];
}

/** Splits never-contacted leads into four buckets that don't overlap and sum to `total`. */
export function neverContactedBreakdown(store: DataStore, leads: EnrichedLead[]): NeverContactedBreakdown {
  const never = leads.filter((l) => !l.reached.has('contacted'));
  const open = never.filter((l) => !l.statusUnclear && !l.isLost);
  const overdue = (l: EnrichedLead) => leadAgeHours(store, l) >= NEVER_CONTACTED_HOURS;
  return {
    total: never.length,
    openActionable: open.filter(overdue),
    openFresh: open.filter((l) => !overdue(l)),
    statusUnclear: never.filter((l) => l.statusUnclear),
    closed: never.filter((l) => l.isLost),
  };
}

export interface ContactSpeedBucket {
  label: string;
  /** Lower bound in hours (inclusive); null for the "Never" bucket. */
  minHours: number | null;
  /** Upper bound in hours (exclusive); null when open-ended. */
  maxHours: number | null;
  leads: number;
  /** Leads that reached "order placed". */
  orders: number;
  conversion: number;
}

const CONTACT_EDGES: ReadonlyArray<[number, number | null]> = [
  [0, 24],
  [24, 48],
  [48, 72],
  [72, null],
];

/** Lead → order by first-contact speed. The first bucket is leads never contacted. */
export function contactSpeedBuckets(leads: EnrichedLead[]): ContactSpeedBucket[] {
  const bucket = (label: string, minHours: number | null, maxHours: number | null, list: EnrichedLead[]) => {
    const orders = list.filter((l) => l.reached.has('order_placed')).length;
    return { label, minHours, maxHours, leads: list.length, orders, conversion: ratio(orders, list.length) };
  };
  const contacted = leads.filter((l) => l.firstContactHours !== null);
  return [
    bucket('Never', null, null, leads.filter((l) => l.firstContactHours === null)),
    ...CONTACT_EDGES.map(([min, max]) =>
      bucket(
        max === null ? `${min} h or more` : min === 0 ? `Under ${max} h` : `${min}–${max} h`,
        min,
        max,
        contacted.filter((l) => {
          // A negative gap is a timestamp glitch; treat it as an instant first contact.
          const h = Math.max(0, l.firstContactHours ?? 0);
          return h >= min && (max === null || h < max);
        }),
      ),
    ),
  ];
}

/** Longest order-to-delivery time on record, in days. Older bookings are likely cancelled. */
export function slowestDeliveryDays(store: DataStore): number {
  return store.deliveries.reduce((m, d) => Math.max(m, d.days_to_deliver), 0);
}

/** A booked, undelivered order as of the dataset end. */
export interface Booking {
  lead: EnrichedLead;
  /** Whole days since the order was placed. */
  age: number;
  /** The promised handover date (`expected_close_date`, YYYY-MM-DD). */
  promised: string;
  pastPromised: boolean;
}

/** Every booked, undelivered order in the scope, oldest first. */
export function bookings(store: DataStore, scope: Scope): Booking[] {
  const today = store.asOf.slice(0, 10);
  return scopedLeads(store, scope)
    .filter((l) => l.effectiveStatus === 'order_placed')
    .map((lead) => ({
      lead,
      age: orderAgeDays(store, lead),
      promised: lead.expected_close_date,
      pastPromised: lead.expected_close_date < today,
    }))
    .sort((a, b) => b.age - a.age);
}

export interface AgeBucket {
  label: string;
  /** Inclusive lower bound in days. */
  min: number;
  /** Inclusive upper bound in days; null for the open-ended last bucket. */
  max: number | null;
  count: number;
  value: number;
}

const BOOKING_AGE_EDGES: ReadonlyArray<[number, number | null]> = [
  [0, STUCK_ORDER_DAYS],
  [STUCK_ORDER_DAYS + 1, STUCK_ORDER_DAYS * 2],
  [STUCK_ORDER_DAYS * 2 + 1, STUCK_ORDER_DAYS * 3],
  [STUCK_ORDER_DAYS * 3 + 1, null],
];

/** Booked, undelivered orders by age: up to 30, 31–60, 61–90 and over 90 days. */
export function bookingAges(store: DataStore, scope: Scope): AgeBucket[] {
  const list = bookings(store, scope);
  return BOOKING_AGE_EDGES.map(([min, max]) => {
    const inBucket = list.filter((b) => b.age >= min && (max === null || b.age <= max));
    return {
      label: max === null ? `${min - 1}+ d` : min === 0 ? `≤${max} d` : `${min}–${max} d`,
      min,
      max,
      count: inBucket.length,
      value: inBucket.reduce((s, b) => s + b.lead.deal_value, 0),
    };
  });
}

export interface PastPromised {
  count: number;
  /** All booked, undelivered orders in the scope. */
  total: number;
  value: number;
  bookings: Booking[];
}

/** Booked, undelivered orders past their promised (expected close) date. */
export function pastPromised(store: DataStore, scope: Scope): PastPromised {
  const all = bookings(store, scope);
  const late = all.filter((b) => b.pastPromised);
  return { count: late.length, total: all.length, value: late.reduce((s, b) => s + b.lead.deal_value, 0), bookings: late };
}

export interface MonthPoint {
  month: string;
  units: number;
  targetUnits: number | null;
  revenue: number;
  targetRevenue: number | null;
  leads: number;
}

export function monthlyTrend(store: DataStore, scope: Scope, range: MonthRange): MonthPoint[] {
  const leads = scopedLeads(store, scope);
  const deliveries = scopedDeliveries(store, scope);
  return monthsInRange(store.months, range).map((month) => {
    const md = deliveries.filter((d) => d.deliveryMonth === month);
    const targets = scope.repId
      ? null
      : store.targets.filter((t) => t.month === month && (!scope.branchId || t.branch_id === scope.branchId));
    return {
      month,
      units: md.length,
      revenue: md.reduce((s, d) => s + d.dealValue, 0),
      targetUnits: targets ? targets.reduce((s, t) => s + t.target_units, 0) : null,
      targetRevenue: targets ? targets.reduce((s, t) => s + t.target_revenue, 0) : null,
      leads: leads.filter((l) => l.createdMonth === month).length,
    };
  });
}

export interface FunnelStep {
  stage: FunnelStage;
  count: number;
  /** Share of the first stage that reached this one. */
  ofTotal: number;
  /** Share of the previous stage that moved on to this one. */
  fromPrevious: number;
  /** Leads lost while sitting in this stage. */
  lostHere: number;
}

export function funnel(leads: EnrichedLead[]): FunnelStep[] {
  const total = leads.length;
  let previous = total;
  return FUNNEL_STAGES.map((stage) => {
    const count = leads.filter((l) => l.reached.has(stage)).length;
    const step: FunnelStep = {
      stage,
      count,
      ofTotal: ratio(count, total),
      fromPrevious: ratio(count, previous),
      lostHere: leads.filter((l) => l.lostAtStage === stage).length,
    };
    previous = count;
    return step;
  });
}

export interface CountRow {
  label: string;
  count: number;
  share: number;
}

function countBy<T>(items: T[], key: (item: T) => string): CountRow[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    const k = key(item);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count, share: ratio(count, items.length) }))
    .sort((a, b) => b.count - a.count);
}

export const NOT_RECORDED = 'Not recorded';

export function lostReasons(leads: EnrichedLead[]): CountRow[] {
  return countBy(
    leads.filter((l) => l.isLost),
    (l) => l.lost_reason ?? NOT_RECORDED,
  );
}

export function delayReasons(deliveries: EnrichedDelivery[]): CountRow[] {
  return countBy(
    deliveries.filter((d) => d.delay_reason),
    (d) => d.delay_reason ?? NOT_RECORDED,
  );
}

export interface SourceRow {
  source: LeadSource;
  leads: number;
  conversion: number;
  revenue: number;
}

export function sourcePerformance(leads: EnrichedLead[]): SourceRow[] {
  const bySource = new Map<LeadSource, EnrichedLead[]>();
  for (const l of leads) {
    const list = bySource.get(l.source) ?? [];
    list.push(l);
    bySource.set(l.source, list);
  }
  return [...bySource.entries()]
    .map(([source, list]) => ({
      source,
      leads: list.length,
      conversion: ratio(list.filter((l) => l.reached.has('order_placed')).length, list.length),
      revenue: list.filter((l) => l.status === 'delivered').reduce((s, l) => s + l.deal_value, 0),
    }))
    .sort((a, b) => b.leads - a.leads);
}

export interface BranchRow {
  branchId: string;
  name: string;
  city: string;
  summary: Summary;
}

export function branchRows(store: DataStore, range: MonthRange): BranchRow[] {
  return store.branches.map((b) => ({
    branchId: b.id,
    name: b.name,
    city: b.city,
    summary: summarize(store, { branchId: b.id }, range),
  }));
}

/** A rep needs at least this many leads in range before we compare them with peers. */
export const REP_MIN_LEADS = 8;
/** A rep is flagged when their lead → order rate is below this share of their peers' rate. */
export const REP_PEER_FACTOR = 0.6;

export interface RepRow {
  repId: string;
  name: string;
  role: SalesRep['role'];
  branchId: string;
  summary: Summary;
  /**
   * Pooled lead → order rate of the other sales officers at the same branch
   * (NaN when there are none with leads).
   */
  peerConversion: number;
  /** Flagged by `repConversionFlags`: drives both the rep table and the rep-conversion alert. */
  belowPeers: boolean;
}

type RepBase = Omit<RepRow, 'peerConversion' | 'belowPeers'>;

export interface RepFlag {
  peerConversion: number;
  belowPeers: boolean;
}

/**
 * The one rule for "converts well below peers": a sales officer with at least
 * REP_MIN_LEADS leads whose rate is below REP_PEER_FACTOR x the pooled rate of the
 * other sales officers at the same branch (the rep is excluded from their own peers).
 */
export function repConversionFlags(rows: ReadonlyArray<RepBase>): Map<string, RepFlag> {
  const flags = new Map<string, RepFlag>();
  for (const rep of rows) {
    const peers = rows.filter(
      (r) => r.branchId === rep.branchId && r.role === 'sales_officer' && r.repId !== rep.repId && r.summary.leads > 0,
    );
    const peerLeads = peers.reduce((s, r) => s + r.summary.leads, 0);
    const peerOrders = peers.reduce((s, r) => s + r.summary.conversion * r.summary.leads, 0);
    const peerConversion = ratio(peerOrders, peerLeads);
    const belowPeers =
      rep.role === 'sales_officer' &&
      rep.summary.leads >= REP_MIN_LEADS &&
      Number.isFinite(peerConversion) &&
      rep.summary.conversion < peerConversion * REP_PEER_FACTOR;
    flags.set(rep.repId, { peerConversion, belowPeers });
  }
  return flags;
}

/**
 * Rep rows for one branch (or every branch when `branchId` is undefined). Each rep is
 * summarised once, and peer flags are computed from the same rows.
 */
export function repRows(store: DataStore, branchId: string | undefined, range: MonthRange): RepRow[] {
  const base: RepBase[] = store.reps
    .filter((r) => !branchId || r.branch_id === branchId)
    .map((r) => ({
      repId: r.id,
      name: r.name,
      role: r.role,
      branchId: r.branch_id,
      summary: summarize(store, { repId: r.id }, range),
    }));
  const flags = repConversionFlags(base);
  return (
    base
      .map((r) => ({ ...r, peerConversion: NaN, belowPeers: false, ...flags.get(r.repId) }))
      // Managers in this dataset carry no leads; keep them visible but below the sales officers.
      .sort((a, b) => b.summary.revenue - a.summary.revenue || b.summary.leads - a.summary.leads)
  );
}

/** Inputs for the what-if simulator: the funnel rates it scales. */
export interface WhatIfBase {
  leads: number;
  leadToTestDrive: number;
  testDrives: number;
  testDriveToOrder: number;
  orderToDelivery: number;
  avgDealValue: number;
  units: number;
  revenue: number;
}

export function whatIfBase(store: DataStore, scope: Scope, range: MonthRange): WhatIfBase {
  const leads = cohort(store, scope, range);
  const testDrives = leads.filter((l) => l.reached.has('test_drive')).length;
  const orders = leads.filter((l) => l.reached.has('order_placed')).length;
  const delivered = leads.filter((l) => l.reached.has('delivered'));
  return {
    leads: leads.length,
    leadToTestDrive: ratio(testDrives, leads.length),
    testDrives,
    testDriveToOrder: ratio(orders, testDrives),
    orderToDelivery: ratio(delivered.length, orders),
    avgDealValue: ratio(
      delivered.reduce((s, l) => s + l.deal_value, 0),
      delivered.length,
    ),
    units: delivered.length,
    revenue: delivered.reduce((s, l) => s + l.deal_value, 0),
  };
}

export { median, ratio };
