import type { MonthRange } from './types';

export interface RangePreset {
  id: string;
  label: string;
  range: MonthRange;
}

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Reads ?from=YYYY-MM&to=YYYY-MM. Anything missing, malformed or outside the
 * dataset falls back to the full range, so a bad link still shows a page.
 */
export function parseRange(params: SearchParams, months: string[]): MonthRange {
  const all: MonthRange = { from: months[0] ?? '', to: months[months.length - 1] ?? '' };
  const from = first(params.from);
  const to = first(params.to);
  const valid = (m: string | undefined): m is string => !!m && MONTH_RE.test(m) && months.includes(m);

  const range: MonthRange = {
    from: valid(from) ? from : all.from,
    to: valid(to) ? to : all.to,
  };
  if (range.from > range.to) return { from: range.to, to: range.from };
  return range;
}

export function inRange(month: string, range: MonthRange): boolean {
  return month >= range.from && month <= range.to;
}

export function monthsInRange(months: string[], range: MonthRange): string[] {
  return months.filter((m) => inRange(m, range));
}

export function isFullRange(range: MonthRange, months: string[]): boolean {
  return range.from === months[0] && range.to === months[months.length - 1];
}

/** Presets built from the months actually in the data. */
export function buildPresets(months: string[]): RangePreset[] {
  const last = months[months.length - 1];
  const firstMonth = months[0];
  if (!last || !firstMonth) return [];

  const presets: RangePreset[] = [{ id: 'all', label: 'All months', range: { from: firstMonth, to: last } }];
  const last3 = months.slice(-3);
  if (last3.length === 3 && last3[0]) {
    presets.push({ id: 'l3m', label: 'Last 3 months', range: { from: last3[0], to: last } });
  }
  const year = last.slice(0, 4);
  const quarters: Array<[string, string, string]> = [
    ['q3', `${year}-07`, `${year}-09`],
    ['q4', `${year}-10`, `${year}-12`],
  ];
  for (const [id, from, to] of quarters) {
    if (months.includes(from) && months.includes(to)) {
      presets.push({ id, label: `${id.toUpperCase()} ${year}`, range: { from, to } });
    }
  }
  presets.push({ id: 'last', label: 'Latest month', range: { from: last, to: last } });
  return presets;
}

/** Query string that carries the range across links; empty for the default range. */
export function rangeQuery(range: MonthRange, months: string[]): string {
  if (isFullRange(range, months)) return '';
  return `?from=${range.from}&to=${range.to}`;
}
