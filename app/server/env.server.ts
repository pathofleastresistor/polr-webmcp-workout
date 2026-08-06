import { z } from "zod";

/**
 * Secrets are provisioned with `wrangler secret put` and therefore do not appear
 * in the generated `Env` type. Declaring them here keeps every read type-safe
 * without ever committing a value.
 */
export interface Secrets {
  BETTER_AUTH_SECRET: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
}

export type AppEnv = Env &
  Partial<Secrets> & {
    /** See `demoMode` below. Absent from wrangler.jsonc by design. */
    DEMO_MODE?: string;
  };

const authSecretSchema = z
  .string()
  .min(32, "BETTER_AUTH_SECRET must be at least 32 characters");

const googleSchema = z.object({
  GOOGLE_CLIENT_ID: z.string().min(1, "GOOGLE_CLIENT_ID is required"),
  GOOGLE_CLIENT_SECRET: z.string().min(1, "GOOGLE_CLIENT_SECRET is required"),
});

const appUrlSchema = z
  .url({ error: "APP_URL must be an absolute URL" })
  .refine((value) => !value.endsWith("/"), {
    error: "APP_URL must not have a trailing slash",
  });

export interface AppConfig {
  BETTER_AUTH_SECRET: string;
  /** Empty in demo mode, where Google is not configured. */
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  appUrl: string;
  /** Cookies are only marked `Secure` when the deployment is actually HTTPS. */
  useSecureCookies: boolean;
  /**
   * Demo mode swaps Google sign-in for a one-click throwaway account so the app
   * can be explored before any OAuth client exists.
   *
   * It is an authentication bypass, so it is off unless `DEMO_MODE=true` is set
   * explicitly, it is deliberately absent from wrangler.jsonc (a normal
   * `wrangler deploy` therefore cannot carry it), and every request it enables
   * is behind a `requireDemoMode` guard rather than a scattered boolean check.
   */
  demoMode: boolean;
  /** True when Google sign-in is actually usable. */
  googleEnabled: boolean;
}

/**
 * Validates configuration once per isolate and fails loudly if a deployment is
 * missing a secret, rather than silently degrading to an insecure default.
 */
export function readConfig(env: AppEnv): AppConfig {
  const demoMode = env.DEMO_MODE === "true";
  const issues: string[] = [];

  const authSecret = authSecretSchema.safeParse(env.BETTER_AUTH_SECRET);
  if (!authSecret.success) {
    issues.push(
      `BETTER_AUTH_SECRET: ${authSecret.error.issues[0]?.message ?? "is required"}`,
    );
  }

  // Google stays mandatory for a normal deployment. Demo mode is the only way
  // to run without it, and it announces itself loudly below.
  const google = googleSchema.safeParse({
    GOOGLE_CLIENT_ID: env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: env.GOOGLE_CLIENT_SECRET,
  });
  if (!google.success && !demoMode) {
    for (const issue of google.error.issues) {
      issues.push(`${issue.path.join(".")}: ${issue.message}`);
    }
  }

  if (issues.length > 0) {
    throw new Error(
      `Server is misconfigured. ${issues.join("; ")}. See README.md for the required secrets.`,
    );
  }

  const appUrl = appUrlSchema.parse(env.APP_URL);

  if (demoMode) {
    console.warn(
      "[spotter] DEMO MODE IS ON. Anyone can sign in without credentials and " +
        "every visitor gets a throwaway account seeded with fake data. Never " +
        "set DEMO_MODE on a deployment holding real user data.",
    );
  }

  return {
    BETTER_AUTH_SECRET: env.BETTER_AUTH_SECRET ?? "",
    GOOGLE_CLIENT_ID: google.success ? google.data.GOOGLE_CLIENT_ID : "",
    GOOGLE_CLIENT_SECRET: google.success
      ? google.data.GOOGLE_CLIENT_SECRET
      : "",
    appUrl,
    useSecureCookies: appUrl.startsWith("https://"),
    demoMode,
    googleEnabled: google.success,
  };
}
