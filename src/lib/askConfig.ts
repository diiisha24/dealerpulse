/** Ask DealerPulse settings, read from server-side environment variables. */

export const DEFAULT_MODEL = 'gemini-2.5-flash';
export const DEFAULT_PER_MINUTE = 8;
export const DEFAULT_PER_DAY = 60;

export interface AskConfig {
  /** False when the kill switch is off or no API key is set: answer offline. */
  live: boolean;
  model: string;
  perMinute: number;
  perDay: number;
}

type Env = Record<string, string | undefined>;

function positiveInt(value: string | undefined, fallback: number): number {
  if (!value || !/^\d+$/.test(value.trim())) return fallback;
  const n = Number(value.trim());
  return Number.isSafeInteger(n) && n > 0 ? n : fallback;
}

export function readAskConfig(env: Env = process.env): AskConfig {
  const enabled = env.ASK_AI_ENABLED?.trim().toLowerCase() !== 'false';
  const hasKey = Boolean(env.GOOGLE_API_KEY?.trim());
  const model = env.GEMINI_MODEL?.trim();
  return {
    live: enabled && hasKey,
    // Model IDs are lowercase letters, digits, dots and dashes; anything else falls back.
    model: model && /^[a-z0-9][a-z0-9.-]{2,63}$/.test(model) ? model : DEFAULT_MODEL,
    perMinute: positiveInt(env.ASK_AI_RATE_LIMIT_PER_MINUTE, DEFAULT_PER_MINUTE),
    perDay: positiveInt(env.ASK_AI_RATE_LIMIT_PER_DAY, DEFAULT_PER_DAY),
  };
}
