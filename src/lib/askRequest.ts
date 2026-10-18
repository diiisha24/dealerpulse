import type { DataStore } from './data';
import type { Scope } from './metrics';
import { parseRange } from './range';
import type { MonthRange } from './types';

/** Pure request validation for POST /api/ask, kept here so it is testable without HTTP. */

export const MAX_BODY_BYTES = 16 * 1024;
export const MAX_QUESTION_CHARS = 500;
export const MAX_HISTORY_ITEMS = 4;
export const MAX_HISTORY_CHARS = 1500;

export interface HistoryTurn {
  role: 'user' | 'assistant';
  text: string;
}

export interface AskRequest {
  question: string;
  history: HistoryTurn[];
  range: MonthRange;
  scope: Scope;
}

export type ParseResult = { ok: true; value: AskRequest } | { ok: false; error: string };

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const ALLOWED_KEYS = new Set(['question', 'history', 'from', 'to', 'branchId', 'repId']);

const fail = (error: string): ParseResult => ({ ok: false, error });

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseHistory(value: unknown): HistoryTurn[] | string {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return 'History must be a list of earlier messages.';
  if (value.length > MAX_HISTORY_ITEMS) return `Only the last ${MAX_HISTORY_ITEMS} messages can be sent as history.`;
  const turns: HistoryTurn[] = [];
  for (const item of value) {
    if (!isRecord(item) || (item.role !== 'user' && item.role !== 'assistant') || typeof item.text !== 'string') {
      return 'Each history item needs a role (user or assistant) and text.';
    }
    const text = item.text.trim();
    if (text.length > MAX_HISTORY_CHARS) return `Each history message must be ${MAX_HISTORY_CHARS} characters or fewer.`;
    if (text) turns.push({ role: item.role, text });
  }
  // The conversation must open with the user; drop any leading assistant turns.
  while (turns[0]?.role === 'assistant') turns.shift();
  return turns;
}

function parseMonth(value: unknown, label: string, months: string[]): string | undefined | { error: string } {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !MONTH_RE.test(value)) return { error: `"${label}" must be a month written YYYY-MM.` };
  if (!months.includes(value)) {
    return { error: `"${label}" must be between ${months[0]} and ${months[months.length - 1]}.` };
  }
  return value;
}

export function parseAskRequest(body: unknown, store: DataStore): ParseResult {
  if (!isRecord(body)) return fail('Send a JSON object with a "question".');
  for (const key of Object.keys(body)) {
    if (!ALLOWED_KEYS.has(key)) return fail(`Unexpected field "${key}".`);
  }

  if (typeof body.question !== 'string') return fail('Please type a question.');
  const question = body.question.trim();
  if (!question) return fail('Please type a question.');
  if (question.length > MAX_QUESTION_CHARS) return fail(`Questions must be ${MAX_QUESTION_CHARS} characters or fewer.`);

  const history = parseHistory(body.history);
  if (typeof history === 'string') return fail(history);

  const from = parseMonth(body.from, 'from', store.months);
  if (isRecord(from)) return fail(String(from.error));
  const to = parseMonth(body.to, 'to', store.months);
  if (isRecord(to)) return fail(String(to.error));
  // parseRange fills a missing end with the dataset bounds and swaps a reversed range.
  const range = parseRange({ from, to }, store.months);

  const scope: Scope = {};
  if (body.branchId !== undefined) {
    if (typeof body.branchId !== 'string' || !store.branchById.has(body.branchId)) return fail('Unknown branch.');
    scope.branchId = body.branchId;
  }
  if (body.repId !== undefined) {
    if (typeof body.repId !== 'string' || !store.repById.has(body.repId)) return fail('Unknown sales officer.');
    if (scope.branchId && store.repById.get(body.repId)?.branch_id !== scope.branchId) {
      return fail('That sales officer does not belong to this branch.');
    }
    scope.repId = body.repId;
  }

  return { ok: true, value: { question, history, range, scope } };
}
