/**
 * Per-key request limits (per minute and per day), held in memory.
 *
 * This is per server instance and resets on every cold start, which is fine for
 * a demo. Production needs a shared store (for example Vercel KV or Upstash
 * Redis) so the limit holds across instances.
 */

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;
/** Stop the map growing without bound if many IPs pass through one instance. */
const MAX_KEYS = 5_000;

interface Bucket {
  /** Request times within the last minute. */
  recent: number[];
  dayStart: number;
  dayCount: number;
}

export type LimitResult = { ok: true } | { ok: false; retryAfterSec: number; window: 'minute' | 'day' };

export interface RateLimiter {
  check(key: string, now?: number): LimitResult;
}

export function createRateLimiter(limits: { perMinute: number; perDay: number }): RateLimiter {
  const buckets = new Map<string, Bucket>();

  function prune(now: number): void {
    for (const [key, b] of buckets) {
      if (now - b.dayStart >= DAY_MS) buckets.delete(key);
    }
    // Still too many: drop the oldest entries (Map keeps insertion order).
    for (const key of buckets.keys()) {
      if (buckets.size <= MAX_KEYS) break;
      buckets.delete(key);
    }
  }

  return {
    check(key, now = Date.now()) {
      if (buckets.size > MAX_KEYS) prune(now);
      let b = buckets.get(key);
      if (!b || now - b.dayStart >= DAY_MS) {
        b = { recent: [], dayStart: now, dayCount: 0 };
        buckets.set(key, b);
      }
      b.recent = b.recent.filter((t) => now - t < MINUTE_MS);

      if (b.dayCount >= limits.perDay) {
        return { ok: false, window: 'day', retryAfterSec: Math.ceil((b.dayStart + DAY_MS - now) / 1000) };
      }
      if (b.recent.length >= limits.perMinute) {
        return { ok: false, window: 'minute', retryAfterSec: Math.ceil((b.recent[0]! + MINUTE_MS - now) / 1000) };
      }
      b.recent.push(now);
      b.dayCount += 1;
      return { ok: true };
    },
  };
}

/** First hop of x-forwarded-for (the client, as seen by the edge), else x-real-ip. */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || headers.get('x-real-ip')?.trim() || 'unknown';
}
