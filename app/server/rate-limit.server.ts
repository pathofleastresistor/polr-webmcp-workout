import type { AppEnv } from "./env.server";

export type RateLimitBinding = "TOOL_RATE_LIMIT" | "AUTH_RATE_LIMIT";

/**
 * Applies a Cloudflare rate limit keyed by user (or client IP when anonymous).
 *
 * Agents can drive tools far faster than a person can click, so every mutating
 * endpoint runs through here. The binding is unavailable under `vite dev`, in
 * which case this is a no-op rather than a hard failure — production always has
 * it because it is declared in wrangler.jsonc.
 */
export async function enforceRateLimit(
  env: AppEnv,
  binding: RateLimitBinding,
  key: string,
): Promise<void> {
  const limiter = env[binding] as RateLimit | undefined;
  if (!limiter) return;

  const { success } = await limiter.limit({ key });
  if (success) return;

  throw new Response(
    JSON.stringify({
      error: "rate_limited",
      message:
        "Too many requests. Slow down and retry in a moment — this limit protects the account from runaway agent loops.",
    }),
    {
      status: 429,
      headers: { "Content-Type": "application/json", "Retry-After": "60" },
    },
  );
}

/** Falls back to the connecting IP so anonymous traffic is still bounded. */
export function rateLimitKey(request: Request, userId: string | null): string {
  if (userId) return `user:${userId}`;
  return `ip:${clientIp(request) ?? "unknown"}`;
}

/**
 * Best-effort client address.
 *
 * On Cloudflare, `CF-Connecting-IP` is set by the edge and cannot be spoofed,
 * so it wins. Self-hosted behind a reverse proxy (Caddy, nginx, Traefik) that
 * header is absent and `X-Forwarded-For` carries the chain instead — without
 * this, every anonymous request shares the key "unknown" and the auth rate
 * limit becomes one global bucket rather than per-client.
 *
 * The *rightmost* entry is used, not the leftmost. A client can prepend
 * anything it likes to `X-Forwarded-For`; the proxy appends the address it
 * actually saw, so the last entry is the only one a single trusted hop
 * guarantees. Taking the first would let a caller mint a fresh rate-limit
 * bucket per request just by varying the header.
 */
export function clientIp(request: Request): string | null {
  const cloudflare = request.headers.get("CF-Connecting-IP");
  if (cloudflare) return cloudflare;

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
