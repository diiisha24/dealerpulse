import raw from '../../data/dealership_data.json';
import type { Branch, Dataset, Delivery, FunnelStage, Lead, LeadStatus, SalesRep, Target } from './types';
import { FUNNEL_STAGES, OPEN_STATUSES } from './types';

const DAY_MS = 86_400_000;

/**
 * A lead plus the fields we derive from its status history once, at load time,
 * so every page reads the same answers.
 */
export interface EnrichedLead extends Lead {
  /** YYYY-MM the lead was created. */
  createdMonth: string;
  reached: ReadonlySet<FunnelStage>;
  /**
   * Marked lost in the CRM with no "lost" step in its history. These are
   * counted as open, at their last recorded stage, until someone confirms them.
   */
  statusUnclear: boolean;
  /**
   * The status the dashboard uses: the CRM status, except that a status-unclear
   * lead takes its last recorded stage instead of "lost".
   */
  effectiveStatus: LeadStatus;
  /** Lost with the loss recorded in its history. Status-unclear leads are not lost. */
  isLost: boolean;
  /** Open by effective status (new to negotiation), including status-unclear leads. */
  isOpen: boolean;
  /** Last stage the lead was in before it was lost (null unless `isLost`). */
  lostAtStage: FunnelStage | null;
  /**
   * @deprecated Use `statusUnclear` (no "lost" step) or `isLost && !lost_reason`.
   * Kept for compatibility: marked lost with no "lost" step or no reason.
   */
  lostWithoutRecord: boolean;
  orderedAt: string | null;
  firstContactHours: number | null;
  /** Days between last activity and the dataset's "as of" date. */
  daysSinceActivity: number;
}

export interface EnrichedDelivery extends Delivery {
  deliveryMonth: string;
  branchId: string;
  repId: string;
  dealValue: number;
}

export interface DataStore {
  branches: Branch[];
  reps: SalesRep[];
  leads: EnrichedLead[];
  deliveries: EnrichedDelivery[];
  targets: Target[];
  months: string[];
  /** Latest timestamp in the dataset. The dashboard treats this as "today". */
  asOf: string;
  branchById: Map<string, Branch>;
  repById: Map<string, SalesRep>;
  leadById: Map<string, EnrichedLead>;
}

const toMonth = (iso: string): string => iso.slice(0, 7);

function isFunnelStage(status: LeadStatus): status is FunnelStage {
  return (FUNNEL_STAGES as readonly LeadStatus[]).includes(status);
}

function computeAsOf(data: Dataset): string {
  let max = '';
  for (const lead of data.leads) {
    if (lead.last_activity_at > max) max = lead.last_activity_at;
  }
  for (const d of data.deliveries) {
    if (d.delivery_date > max.slice(0, 10)) max = `${d.delivery_date}T23:59:59Z`;
  }
  return max;
}

function enrichLead(lead: Lead, asOfMs: number): EnrichedLead {
  const reached = new Set<FunnelStage>();
  let lastStageBeforeLoss: FunnelStage | null = null;
  let orderedAt: string | null = null;
  let contactedAt: string | null = null;
  let hasLostEvent = false;

  for (const event of lead.status_history) {
    if (event.status === 'lost') {
      hasLostEvent = true;
    } else if (isFunnelStage(event.status)) {
      reached.add(event.status);
      lastStageBeforeLoss = event.status;
      if (event.status === 'order_placed') orderedAt = event.timestamp;
      if (event.status === 'contacted' && !contactedAt) contactedAt = event.timestamp;
    }
  }
  // Every lead starts as "new" even if the history omits it.
  reached.add('new');

  const markedLost = lead.status === 'lost';
  const statusUnclear = markedLost && !hasLostEvent;
  const isLost = markedLost && !statusUnclear;
  const effectiveStatus: LeadStatus = statusUnclear ? lastStageBeforeLoss ?? 'new' : lead.status;
  const firstContactHours = contactedAt
    ? (Date.parse(contactedAt) - Date.parse(lead.created_at)) / 3_600_000
    : null;

  return {
    ...lead,
    createdMonth: toMonth(lead.created_at),
    reached,
    statusUnclear,
    effectiveStatus,
    isLost,
    isOpen: OPEN_STATUSES.includes(effectiveStatus),
    lostAtStage: isLost ? lastStageBeforeLoss ?? 'new' : null,
    lostWithoutRecord: markedLost && (!hasLostEvent || !lead.lost_reason),
    orderedAt,
    firstContactHours,
    daysSinceActivity: Math.max(0, Math.floor((asOfMs - Date.parse(lead.last_activity_at)) / DAY_MS)),
  };
}

function buildStore(data: Dataset): DataStore {
  const asOf = computeAsOf(data);
  const asOfMs = Date.parse(asOf);

  const leads = data.leads.map((l) => enrichLead(l, asOfMs));
  const leadById = new Map(leads.map((l) => [l.id, l]));

  const deliveries: EnrichedDelivery[] = [];
  for (const d of data.deliveries) {
    const lead = leadById.get(d.lead_id);
    // A delivery without a matching lead cannot be attributed to a branch; skip it.
    if (!lead) continue;
    deliveries.push({
      ...d,
      deliveryMonth: toMonth(d.delivery_date),
      branchId: lead.branch_id,
      repId: lead.assigned_to,
      dealValue: lead.deal_value,
    });
  }

  const monthSet = new Set<string>(data.targets.map((t) => t.month));
  for (const l of leads) monthSet.add(l.createdMonth);
  const months = [...monthSet].sort();

  return {
    branches: data.branches,
    reps: data.sales_reps,
    leads,
    deliveries,
    targets: data.targets,
    months,
    asOf,
    branchById: new Map(data.branches.map((b) => [b.id, b])),
    repById: new Map(data.sales_reps.map((r) => [r.id, r])),
    leadById,
  };
}

let cached: DataStore | null = null;

/** Parses and indexes the dataset once per server process. */
export function getStore(): DataStore {
  if (!cached) cached = buildStore(raw as unknown as Dataset);
  return cached;
}

export const __test__ = { buildStore, enrichLead };
