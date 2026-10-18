import { ApiError, FinishReason, GoogleGenAI } from '@google/genai';
import { readAskConfig } from '@/lib/askConfig';
import { MAX_BODY_BYTES, parseAskRequest, type AskRequest } from '@/lib/askRequest';
import { offlineAnswer } from '@/lib/curatedAnswers';
import { CURATED_QUESTIONS } from '@/lib/curatedQuestions';
import { getStore } from '@/lib/data';
import { buildFactSheet } from '@/lib/factsheet';
import { clientIp, createRateLimiter, type RateLimiter } from '@/lib/rateLimit';
import { verifyNumbers } from '@/lib/verifyNumbers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };

const SYSTEM_PROMPT = `You are DealerPulse's analyst. You answer questions from the CEO and branch managers of a Toyota dealership group about their sales performance.

Answer only from the fact sheet below. If the fact sheet doesn't hold what is needed, say plainly which figure or breakdown is missing instead of estimating it.

Lead with the answer, in one to three short paragraphs or a short list of "- " bullets. Use the dashboard's exact metric labels from the glossary (for example "Lead → order", "Leads lost", "Open pipeline"). Write money in INR with Cr or L as the fact sheet does, and dates as DD MMM YYYY. Treat 31 Dec 2025, the data's "as of" date, as today. Plain text only: no headings, tables or bold.

If a question has nothing to do with the dealership's sales data, reply in one line that you can only help with DealerPulse figures. Don't end with a generic offer or question such as "Would you like…".`;

const REFUSAL_ANSWER =
  "I can't help with that one. Try a question about sales, leads, targets, deliveries or branch performance.";

let limiter: RateLimiter | null = null;
let limiterKey = '';
let client: GoogleGenAI | null = null;

function getLimiter(perMinute: number, perDay: number): RateLimiter {
  const key = `${perMinute}/${perDay}`;
  if (!limiter || limiterKey !== key) {
    limiter = createRateLimiter({ perMinute, perDay });
    limiterKey = key;
  }
  return limiter;
}

function getClient(): GoogleGenAI {
  // The key is read on the server only and never sent to the browser or logged.
  if (!client) {
    client = new GoogleGenAI({
      apiKey: process.env.GOOGLE_API_KEY,
      httpOptions: { timeout: 45_000 },
    });
  }
  return client;
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return Response.json(body, { status, headers: { ...NO_STORE, ...headers } });
}

const suggestions = CURATED_QUESTIONS.map((q) => ({ id: q.id, question: q.question }));

/** Lets the drawer show its mode (live or offline) and suggestion chips before the first question. */
export function GET(): Response {
  return json({ mode: readAskConfig().live ? 'live' : 'offline', suggestions });
}

export async function POST(request: Request): Promise<Response> {
  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > MAX_BODY_BYTES) return json({ error: 'That message is too long.' }, 413);

  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return json({ error: "We couldn't read that request." }, 400);
  }
  if (Buffer.byteLength(raw, 'utf8') > MAX_BODY_BYTES) return json({ error: 'That message is too long.' }, 413);

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: "We couldn't read that request." }, 400);
  }

  const store = getStore();
  const parsed = parseAskRequest(body, store);
  if (!parsed.ok) return json({ error: parsed.error }, 400);
  const ask = parsed.value;

  const config = readAskConfig();
  if (!config.live) {
    // Kill switch off or no key: answer from our own metrics, never call the API.
    const offline = offlineAnswer(store, ask.range, ask.scope, ask.question);
    return json({ mode: 'offline', answer: offline.answer, matched: offline.matched, suggestions });
  }

  // Only live calls cost money, so only they count against the limit.
  const limit = getLimiter(config.perMinute, config.perDay).check(clientIp(request.headers));
  if (!limit.ok) {
    const message =
      limit.window === 'minute'
        ? "You're asking quickly. Please wait a minute and try again."
        : "You've reached today's question limit. Please try again tomorrow.";
    return json({ error: message }, 429, { 'Retry-After': String(limit.retryAfterSec) });
  }

  return askGemini(ask, config.model, buildFactSheet(store, ask.range, ask.scope));
}

async function askGemini(ask: AskRequest, model: string, factSheet: string): Promise<Response> {
  const contents = [
    ...ask.history.map((turn) => ({
      role: turn.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: turn.text }],
    })),
    { role: 'user', parts: [{ text: ask.question }] },
  ];

  try {
    const response = await getClient().models.generateContent({
      model,
      contents,
      config: {
        systemInstruction: `${SYSTEM_PROMPT}\n\n${factSheet}`,
        maxOutputTokens: 4000,
      },
    });

    const finishReason = response.candidates?.[0]?.finishReason;
    if (
      finishReason &&
      finishReason !== FinishReason.STOP &&
      finishReason !== FinishReason.MAX_TOKENS
    ) {
      return json({ mode: 'live', answer: REFUSAL_ANSWER, verified: true, unverifiedNumbers: [] });
    }

    let answer = response.text?.trim() ?? '';
    if (finishReason === FinishReason.MAX_TOKENS) {
      answer = `${answer}\n\n(This answer was cut short. Try a narrower question.)`.trim();
    }
    if (!answer) {
      return json({ error: "We didn't get an answer back. Please try again." }, 502);
    }

    const check = verifyNumbers(answer, factSheet);
    return json({ mode: 'live', answer, verified: check.verified, unverifiedNumbers: check.unverifiedNumbers });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

/** Maps SDK errors to friendly messages. Raw error text stays in the server log, without the key. */
function apiErrorResponse(error: unknown): Response {
  if (error instanceof ApiError) {
    const status = error.status;
    if (status === 401 || status === 403 || status === 404) {
      console.error(`[ask] ${status === 404 ? 'model not found' : 'credentials rejected'} (${status})`);
      return json({ error: 'Ask DealerPulse is not set up correctly. Please tell the dashboard admin.' }, 503);
    }
    if (status === 429) {
      console.error('[ask] upstream rate limit (429)');
      return json({ error: 'Ask DealerPulse is busy right now. Please try again in a minute.' }, 429, {
        'Retry-After': '60',
      });
    }
    if (status === 400) {
      console.error('[ask] bad request (400)');
      return json({ error: "That question couldn't be processed. Please rephrase it and try again." }, 502);
    }
    if (status >= 500) {
      console.error(`[ask] upstream server error (${status})`);
      return json({ error: 'The AI service is having trouble. Please try again shortly.' }, 503);
    }
    console.error(`[ask] api error (${status})`);
    return json({ error: 'Something went wrong. Please try again.' }, 502);
  }
  if (error instanceof Error && error.name === 'AbortError') {
    console.error('[ask] timeout');
    return json({ error: 'That took too long. Please try again.' }, 504);
  }
  console.error('[ask] unexpected error', error instanceof Error ? error.name : typeof error);
  return json({ error: 'Something went wrong. Please try again.' }, 500);
}
