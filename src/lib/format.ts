import type { LeadSource, LeadStatus } from './types';

const CRORE = 10_000_000;
const LAKH = 100_000;

/** Indian-market currency: "INR 4.2 Cr", "INR 18.5 L". */
export function formatInr(value: number, opts: { compact?: boolean } = {}): string {
  const { compact = true } = opts;
  if (!compact) {
    return `INR ${Math.round(value).toLocaleString('en-IN')}`;
  }
  const abs = Math.abs(value);
  if (abs >= CRORE) return `INR ${(value / CRORE).toFixed(abs >= 100 * CRORE ? 0 : 1)} Cr`;
  if (abs >= LAKH) return `INR ${(value / LAKH).toFixed(1)} L`;
  return `INR ${Math.round(value).toLocaleString('en-IN')}`;
}

/** Crores without the currency prefix, for chart axes. */
export function formatCrShort(value: number): string {
  return `${(value / CRORE).toFixed(value >= 10 * CRORE ? 0 : 1)} Cr`;
}

export function formatPct(ratio: number, digits = 0): string {
  if (!Number.isFinite(ratio)) return '–';
  return `${(ratio * 100).toFixed(digits)}%`;
}

export function formatNumber(value: number): string {
  return value.toLocaleString('en-IN');
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2025-10" -> "Oct 2025" (or "Oct" when short). */
export function formatMonth(month: string, short = false): string {
  const [y, m] = month.split('-');
  const label = MONTHS[Number(m) - 1] ?? month;
  return short ? label : `${label} ${y}`;
}

/** ISO timestamp or date -> "17 Oct 2025" (DD MMM YYYY). */
export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '–';
  return `${String(d.getUTCDate()).padStart(2, '0')} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** Shows only the last 3 digits so the screen can be shown to anyone: "•••••••594". */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length <= 3) return '•••';
  return `${'•'.repeat(digits.length - 3)}${digits.slice(-3)}`;
}

export const STATUS_LABEL: Record<LeadStatus, string> = {
  new: 'New',
  contacted: 'Contacted',
  test_drive: 'Test drive',
  negotiation: 'Negotiation',
  order_placed: 'Order placed',
  delivered: 'Delivered',
  lost: 'Lost',
};

export const SOURCE_LABEL: Record<LeadSource, string> = {
  walk_in: 'Walk-in',
  website: 'Website',
  referral: 'Referral',
  social_media: 'Social media',
  phone_enquiry: 'Phone enquiry',
  auto_expo: 'Auto expo',
};

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}
