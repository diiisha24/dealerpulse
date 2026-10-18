/**
 * Business thresholds used by metrics, alerts, the glossary and the chatbot.
 * Change a rule here and every label and definition follows.
 */

/** A contacted open lead with no activity for this many days is "going cold". */
export const COLD_LEAD_DAYS = 7;

/** A booked order not delivered after this many days is "stuck" (about 2x the median lead time). */
export const STUCK_ORDER_DAYS = 30;

/** A lead still in status "new" this many hours after creation is "never contacted". */
export const NEVER_CONTACTED_HOURS = 48;
