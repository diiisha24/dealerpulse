import type { DataStore, EnrichedLead } from './data';
import { maskPhone } from './format';
import type { LeadSource, LeadStatus } from './types';

/** The subset of a lead the browser needs. The phone number never leaves the server unmasked. */
export interface LeadRow {
  id: string;
  customer: string;
  phone: string;
  source: LeadSource;
  model: string;
  /** Effective status: a status-unclear lead shows its last recorded stage, not "lost". */
  status: LeadStatus;
  /** Marked lost in the CRM with no "lost" step in its history; counted as open. */
  statusUnclear: boolean;
  repId: string;
  repName: string;
  createdAt: string;
  lastActivityAt: string;
  daysIdle: number;
  value: number;
  lostReason: string | null;
  lastNote: string;
}

export function toLeadRows(store: DataStore, leads: EnrichedLead[]): LeadRow[] {
  return leads.map((l) => ({
    id: l.id,
    customer: l.customer_name,
    phone: maskPhone(l.phone),
    source: l.source,
    model: l.model_interested,
    status: l.effectiveStatus,
    statusUnclear: l.statusUnclear,
    repId: l.assigned_to,
    repName: store.repById.get(l.assigned_to)?.name ?? l.assigned_to,
    createdAt: l.created_at,
    lastActivityAt: l.last_activity_at,
    daysIdle: l.daysSinceActivity,
    value: l.deal_value,
    lostReason: l.lost_reason,
    lastNote: l.status_history[l.status_history.length - 1]?.note ?? '',
  }));
}
