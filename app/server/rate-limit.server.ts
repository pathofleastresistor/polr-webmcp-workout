export type RateLimitBucket = "TOOL_RATE_LIMIT" | "ANON_RATE_LIMIT";

interface BucketPolicy {
  /** Requests allowed per window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

/**
 * Carried over verbatim from the rate limit bindings this replaces, so the
 * limits a deployment enforces did not change with the implementation.
 */
const POLICIES: Record<RateLimitBucket, BucketPolicy> = {
  TOOL_RATE_LIMIT: { limit: 120, windowMs: 60_000 },
  ANON_RATE_LIMIT: { limit: 20, windowMs: 60_000 },
};

interface Counter {
  count: number;
  resetAt: number;
}

const counters = new Map<string, Counter>();

/**
 * Bounds memory against an attacker who varies the key — a fresh IP or a
 * forged header per request would otherwise grow this map without limit. Well
 * above any plausible number of concurrent legitimate clients.
 */
const MAX_COUNTERS = 10_000;

function evictExpired(now: number): void {
  for (const [key, counter] of counters) {
    if (counter.resetAt <= now) counters.delete(key);
  }
}

/**
 * Fixed-window rate limit, keyed by user (or client IP when anonymous).
 *
 * Agents can drive tools far faster than a person can click, so every mutating
 * endpoint runs through here.
 *
 * The state is per-process and in memory. For a single self-hosted instance
 * that is the whole system, and it needs no dependency to run. Across several
 * instances each keeps its own counts, so the effective limit multiplies by the
 * number of processes; a deployment that grows that far wants a shared store
 * here instead, and this is the only place that would change.
 */
export async function enforceRateLimit(
  bucket: RateLimitBucket,
  key: string,
): Promise<void> {
  const policy = POLICIES[bucket];
  const now = Date.now();
  const id = `${bucket}:${key}`;

  const existing = counters.get(id);

  if (!existing || existing.resetAt <= now) {
    if (counters.size >= MAX_COUNTERS) {
      evictExpired(now);
      // Still full: every counter is live, so refuse to grow rather than let
      // the map become the attack. Legitimate traffic re-registers next window.
      if (counters.size >= MAX_COUNTERS) counters.clear();
    }
    counters.set(id, { count: 1, resetAt: now + policy.windowMs });
    return;
  }

  existing.count += 1;
  if (existing.count <= policy.limit) return;

  const retryAfter = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));

  throw new Response(
    JSON.stringify({
      error: "rate_limited",
      message:
        "Too many requests. Slow down and retry in a moment — this limit protects the account from runaway agent loops.",
    }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(retryAfter),
      },
    },
  );
}

/** Exposed for tests; production never needs to reset the window. */
export function resetRateLimits(): void {
  counters.clear();
}

/** Falls back to the connecting IP so anonymous traffic is still bounded. */
export function rateLimitKey(request: Request, userId: string | null): string {
  if (userId) return `user:${userId}`;
  return `ip:${clientIp(request) ?? "unknown"}`;
}

/**
 * Best-effort client address.
 *
 * Behind a reverse proxy (Caddy, nginx, Traefik) `X-Forwarded-For` carries the
 * chain — without this, every anonymous request shares the key "unknown" and
 * the anonymous rate limit becomes one global bucket rather than per-client.
 *
 * The *rightmost* entry is used, not the leftmost. A client can prepend
 * anything it likes to `X-Forwarded-For`; the proxy appends the address it
 * actually saw, so the last entry is the only one a single trusted hop
 * guarantees. Taking the first would let a caller mint a fresh rate-limit
 * bucket per request just by varying the header.
 */
export function clientIp(request: Request): string | null {
  const forwarded = request.headers.get("X-Forwarded-For");
  if (forwarded) {
    const hops = forwarded
      .split(",")
      .map((hop) => hop.trim())
      .filter(Boolean);
    const nearest = hops.at(-1);
    if (nearest) return nearest;
  }

  return null;
}
