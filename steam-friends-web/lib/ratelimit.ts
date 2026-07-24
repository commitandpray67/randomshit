/**
 * Best-effort in-memory fixed-window rate limiter.
 *
 * Note: on serverless (Vercel) this state lives per-instance and resets on
 * cold start, so treat it as burst protection, not a hard global guarantee.
 * The meaningful protection against Steam-API abuse is the per-user sync
 * throttle in tracker.ts, which is backed by the database. For strict global
 * limits, swap this for a shared store (Upstash/Vercel KV).
 */

type Entry = { count: number; resetAt: number };
const buckets = new Map<string, Entry>();

export function rateLimit(
  key: string,
  limit: number,
  windowSec: number,
): { ok: boolean; retryAfter: number } {
  const now = Date.now();

  // Occasionally prune expired buckets so the map can't grow unbounded.
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) if (now > v.resetAt) buckets.delete(k);
  }

  const e = buckets.get(key);
  if (!e || now > e.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowSec * 1000 });
    return { ok: true, retryAfter: 0 };
  }
  e.count++;
  if (e.count > limit) {
    return { ok: false, retryAfter: Math.ceil((e.resetAt - now) / 1000) };
  }
  return { ok: true, retryAfter: 0 };
}

/** Best-effort client IP from proxy headers (Vercel sets x-forwarded-for). */
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}
