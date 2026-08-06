import { z } from "zod";

/**
 * The process environment, narrowed to what this deployment reads.
 *
 * Every field is optional at this boundary and checked in `readConfig`, so a
 * missing value fails once, loudly, with a message naming it — rather than as
 * an `undefined` surfacing somewhere deeper.
 */
export interface AppEnv {
  /** Public origin browsers use. No trailing slash. */
  APP_URL?: string;
  BETTER_AUTH_SECRET?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  /** See `demoMode` below. */
  DEMO_MODE?: string;
  /** Path to the SQLite file holding everything. */
  DATABASE_PATH?: string;
}

/** Relative to the working directory, so a bare `npm start` just works. */
export const DEFAULT_DATABASE_PATH = "./data/spotter.db";

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
   * explicitly, it is absent from every committed env file, and every request
   * it enables is behind a `requireDemoMode` guard rather than a scattered
   * boolean check.
   */
  demoMode: boolean;
  /** True when Google sign-in is actually usable. */
  googleEnabled: boolean;
  /** Path to the SQLite file. */
  databasePath: string;
}

/**
 * Validates configuration at startup and fails loudly if a deployment is
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
    databasePath: env.DATABASE_PATH?.trim() || DEFAULT_DATABASE_PATH,
  };
}
