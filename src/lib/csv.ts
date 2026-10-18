export interface CsvColumn<T> {
  header: string;
  value: (row: T) => string | number | null | undefined;
}

/**
 * Spreadsheet apps execute cells that start with these characters as formulas,
 * so we prefix them with a quote (CSV injection guard).
 */
const FORMULA_START = /^[=+\-@\t\r]/;

function escapeCell(raw: string | number | null | undefined): string {
  if (raw === null || raw === undefined) return '';
  let text = String(raw);
  if (typeof raw === 'string' && FORMULA_START.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const header = columns.map((c) => escapeCell(c.header)).join(',');
  const body = rows.map((row) => columns.map((c) => escapeCell(c.value(row))).join(','));
  return [header, ...body].join('\r\n');
}

/** "dealerpulse-actions-2025-10-2025-12.csv": the period goes in the name so exports don't overwrite each other. */
export function periodFilename(prefix: string, range: { from: string; to: string }): string {
  const safe = (s: string) => s.replace(/[^0-9A-Za-z-]/g, '');
  return `${safe(prefix)}-${safe(range.from)}-${safe(range.to)}.csv`;
}

/** Triggers a browser download. Client-side only. */
export function downloadCsv(filename: string, csv: string): void {
  // BOM so Excel opens UTF-8 (names with non-ASCII characters) correctly.
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
