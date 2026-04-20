import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

/**
 * Per-IP rate limit for the /api/generate endpoint.
 *
 * - 10 generations per hour per IP, sliding window
 * - If Upstash env vars are missing, returns a no-op limiter (local dev)
 */
function buildLimiter(): Ratelimit | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  return new Ratelimit({
    redis: new Redis({ url, token }),
    limiter: Ratelimit.slidingWindow(10, "1 h"),
    analytics: true,
    prefix: "conversion-ads",
  });
}

const limiter = buildLimiter();

export type LimitResult = {
  ok: boolean;
  remaining: number;
  limit: number;
  reset: number;
};

export async function checkRateLimit(ip: string): Promise<LimitResult> {
  if (!limiter) {
    // No-op in dev / missing config
    return { ok: true, remaining: 999, limit: 999, reset: 0 };
  }
  const r = await limiter.limit(ip);
  return {
    ok: r.success,
    remaining: r.remaining,
    limit: r.limit,
    reset: r.reset,
  };
}

export function getClientIp(req: Request): string {
  const h = req.headers;
  return (
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    "anonymous"
  );
}
