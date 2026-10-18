/**
 * A light check that the figures in an AI answer appear in the fact sheet it
 * was given. It only drives a "Couldn't verify every figure" badge, so it errs
 * on the side of flagging: sums or percentages the model worked out itself are
 * reported as unverified rather than recomputed.
 */

export type NumberUnit = 'cr' | 'l' | 'pct' | 'plain';

export interface FoundNumber {
  /** The text as written in the answer, e.g. "INR 11.4 Cr". */
  raw: string;
  value: number;
  unit: NumberUnit;
  /** Digits after the decimal point, used to allow rounding of a fact-sheet figure. */
  decimals: number;
}

const MONTH = '(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*';

// Dates, months, years and IDs are not figures; blank them out before scanning.
const IGNORED = [
  new RegExp(`\\b\\d{1,2}\\s+${MONTH}\\.?\\s+\\d{4}\\b`, 'g'), // 31 Dec 2025
  new RegExp(`\\b${MONTH}\\.?\\s+\\d{4}\\b`, 'g'), // Dec 2025
  /\b\d{4}-\d{2}(?:-\d{2})?\b/g, // 2025-12, 2025-12-31
  /\b(?:19|20)\d{2}\b/g, // bare years
  /\b[A-Za-z]+\d+\b/g, // IDs such as L0022, SR19, B3, Q4
  /^\s*\d+[.)]\s/gm, // numbered-list markers
];

const NUMBER_RE = /(?<![\w.])(\d{1,3}(?:,\d{2,3})+|\d+)(?:\.(\d+))?\s*(%|Cr\b|crore\b|L\b|lakh\b)?/gi;

function unitOf(suffix: string | undefined): NumberUnit {
  const s = suffix?.toLowerCase();
  if (s === '%') return 'pct';
  if (s === 'cr' || s === 'crore') return 'cr';
  if (s === 'l' || s === 'lakh') return 'l';
  return 'plain';
}

/** Every figure in the text, in order of appearance. */
export function extractNumbers(text: string): FoundNumber[] {
  let cleaned = text;
  for (const re of IGNORED) cleaned = cleaned.replace(re, (m) => ' '.repeat(m.length));

  const found: FoundNumber[] = [];
  for (const m of cleaned.matchAll(NUMBER_RE)) {
    const whole = (m[1] ?? '').replace(/,/g, '');
    const fraction = m[2] ?? '';
    const value = Number(fraction ? `${whole}.${fraction}` : whole);
    if (!Number.isFinite(value)) continue;
    const unit = unitOf(m[3]);
    const start = m.index ?? 0;
    // Keep an "INR " prefix in the reported text so the badge reads naturally.
    const prefixed = text.slice(Math.max(0, start - 4), start) === 'INR ';
    found.push({
      raw: `${prefixed ? 'INR ' : ''}${text.slice(start, start + m[0].length).trim()}`,
      value,
      unit,
      decimals: fraction.length,
    });
  }
  return found;
}

const round = (value: number, decimals: number): number => {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
};

/**
 * True when the fact sheet holds the same figure: same unit (plain numbers
 * match any unit) and the same value, allowing the answer to round a
 * fact-sheet figure to fewer decimals (18.3 d -> "18 days").
 */
function matches(answer: FoundNumber, facts: FoundNumber[]): boolean {
  return facts.some((f) => {
    if (answer.unit !== 'plain' && f.unit !== answer.unit) return false;
    if (f.value === answer.value) return true;
    return answer.decimals < f.decimals && round(f.value, answer.decimals) === answer.value;
  });
}

export interface VerifyResult {
  verified: boolean;
  unverifiedNumbers: string[];
}

export function verifyNumbers(answer: string, factSheet: string): VerifyResult {
  const facts = extractNumbers(factSheet);
  const unverified: string[] = [];
  for (const n of extractNumbers(answer)) {
    if (!matches(n, facts) && !unverified.includes(n.raw)) unverified.push(n.raw);
  }
  return { verified: unverified.length === 0, unverifiedNumbers: unverified };
}
