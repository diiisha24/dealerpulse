import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GLOSSARY, term, type TermId } from './glossary';
import { COLD_LEAD_DAYS, NEVER_CONTACTED_HOURS, STUCK_ORDER_DAYS } from './thresholds';

const IDS: TermId[] = [
  'lead_to_order',
  'leads_lost',
  'status_unclear',
  'units_delivered',
  'days_to_deliver',
  'open_pipeline',
  'cold_lead',
  'never_contacted',
  'closed_without_call',
  'stuck_order',
  'likely_cancelled',
  'past_promised',
  'attainment',
  'cohort',
  'velocity',
  'forecast',
];

describe('glossary', () => {
  it('covers exactly the 16 agreed terms', () => {
    expect(Object.keys(GLOSSARY).sort()).toEqual([...IDS].sort());
  });

  it('gives every term a non-empty label, short and definition', () => {
    for (const id of IDS) {
      const entry = term(id);
      expect(entry.label.trim(), id).not.toBe('');
      expect(entry.short.trim(), id).not.toBe('');
      expect(entry.definition.trim(), id).not.toBe('');
    }
  });

  it('has no literal threshold numbers in its source', () => {
    const source = readFileSync(join(__dirname, 'glossary.ts'), 'utf8');
    const body = source
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('import '))
      .join('\n');
    expect(body).not.toMatch(/(?<![\w.])(7|30|48)(?![\w.])/);
  });

  it('interpolates the thresholds', () => {
    expect(term('cold_lead').definition).toBe(
      `A contacted open lead with no activity for ${COLD_LEAD_DAYS}+ days.`,
    );
    expect(term('never_contacted').definition).toBe(
      `Still 'new' ${NEVER_CONTACTED_HOURS} hours after it was created, with no first call.`,
    );
    expect(term('stuck_order').definition).toBe(
      `Booked but not delivered more than ${STUCK_ORDER_DAYS} days after the order date.`,
    );
  });

  it('keeps the verbatim copy for the derived terms', () => {
    expect(term('likely_cancelled').definition).toBe(
      'A stuck order older than the slowest delivery on record. Verify with the customer.',
    );
    expect(term('closed_without_call').label).toBe('Closed without a call');
    expect(term('closed_without_call').definition).toBe(
      "A lead closed as lost that never got a first call (no 'contacted' step in its history).",
    );
    expect(term('past_promised').definition).toBe('Booked, not delivered, and past its expected close date.');
    expect(term('status_unclear').definition).toBe(
      "Marked lost in the CRM with no 'lost' step in its history. Counted as open until confirmed.",
    );
  });

  it('matches the metric semantics for losses and pipeline', () => {
    expect(term('leads_lost').definition).toMatch(/status unclear are not counted/);
    expect(term('open_pipeline').definition).toMatch(/including leads with status unclear/);
    expect(term('open_pipeline').definition).toMatch(/Booked orders .* not included/);
  });
});
