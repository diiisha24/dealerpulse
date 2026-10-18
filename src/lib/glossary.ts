import { COLD_LEAD_DAYS, NEVER_CONTACTED_HOURS, STUCK_ORDER_DAYS } from './thresholds';

/**
 * One place for every metric name and definition shown in the UI (InfoTips, table headers,
 * KPI labels) and used by the chatbot. Definitions follow `metrics.ts`; thresholds come from
 * `thresholds.ts`, so changing a rule there updates the copy here.
 */

export type TermId =
  | 'lead_to_order'
  | 'leads_lost'
  | 'status_unclear'
  | 'units_delivered'
  | 'days_to_deliver'
  | 'open_pipeline'
  | 'cold_lead'
  | 'never_contacted'
  | 'closed_without_call'
  | 'stuck_order'
  | 'likely_cancelled'
  | 'past_promised'
  | 'attainment'
  | 'cohort'
  | 'velocity'
  | 'forecast';

export interface GlossaryEntry {
  /** Display name, as used on KPI labels and table headers. */
  label: string;
  /** A few words, for compact hints. */
  short: string;
  /** One or two plain sentences. */
  definition: string;
}

export const GLOSSARY: Record<TermId, GlossaryEntry> = {
  lead_to_order: {
    label: 'Lead → order',
    short: 'Share of new leads that booked an order',
    definition:
      'Share of leads created in the period that reached "order placed", even if the order came after the period ended.',
  },
  leads_lost: {
    label: 'Leads lost',
    short: 'Share of new leads lost',
    definition:
      'Share of leads created in the period that are marked lost with a recorded loss. Leads with status unclear are not counted as lost.',
  },
  status_unclear: {
    label: 'Status unclear',
    short: 'Marked lost, no loss recorded',
    definition:
      "Marked lost in the CRM with no 'lost' step in its history. Counted as open until confirmed.",
  },
  units_delivered: {
    label: 'Units delivered',
    short: 'Cars handed over in the period',
    definition: 'Cars handed over to customers in the period, counted by delivery date.',
  },
  days_to_deliver: {
    label: 'Days to deliver',
    short: 'Average order-to-delivery time',
    definition: 'Average number of days from order to handover, for cars delivered in the period.',
  },
  open_pipeline: {
    label: 'Open pipeline',
    short: 'Leads still being worked',
    definition:
      'Leads still being worked as of the data end date, whatever the time range, including leads with status unclear. Booked orders waiting for delivery are not included.',
  },
  cold_lead: {
    label: 'Cold lead',
    short: `No activity for ${COLD_LEAD_DAYS}+ days`,
    definition: `A contacted open lead with no activity for ${COLD_LEAD_DAYS}+ days.`,
  },
  never_contacted: {
    label: 'Never contacted',
    short: `Still new after ${NEVER_CONTACTED_HOURS} h`,
    definition: `Still 'new' ${NEVER_CONTACTED_HOURS} hours after it was created, with no first call.`,
  },
  closed_without_call: {
    label: 'Closed without a call',
    short: 'Lost before any first call',
    definition: "A lead closed as lost that never got a first call (no 'contacted' step in its history).",
  },
  stuck_order: {
    label: 'Stuck order',
    short: `Booked, undelivered after ${STUCK_ORDER_DAYS}+ days`,
    definition: `Booked but not delivered more than ${STUCK_ORDER_DAYS} days after the order date.`,
  },
  likely_cancelled: {
    label: 'Likely cancelled',
    short: 'Older than the slowest delivery',
    definition: 'A stuck order older than the slowest delivery on record. Verify with the customer.',
  },
  past_promised: {
    label: 'Past promised date',
    short: 'Booked, past expected close',
    definition: 'Booked, not delivered, and past its expected close date.',
  },
  attainment: {
    label: 'Target attainment',
    short: 'Delivered ÷ target',
    definition:
      'Units (or revenue) delivered in the period divided by the target set for the same months. Reps have no targets of their own.',
  },
  cohort: {
    label: 'Cohort',
    short: 'Leads created in the period',
    definition:
      'The leads created in the selected period. Funnel, lead → order, losses and sources follow these leads to today, including orders and deliveries that came later.',
  },
  velocity: {
    label: 'Stage velocity',
    short: 'Median days per stage',
    definition: 'Median number of days a lead takes to move from one stage to the next.',
  },
  forecast: {
    label: 'Forecast',
    short: 'Expected deliveries from today’s pipeline',
    definition:
      'Expected deliveries from open leads and bookings, using the share of past leads at each stage that went on to be delivered. An estimate, not a commitment.',
  },
};

/** Glossary entry for a term. */
export function term(id: TermId): GlossaryEntry {
  return GLOSSARY[id];
}
