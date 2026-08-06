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
  const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
  return `ip:${ip}`;
}
