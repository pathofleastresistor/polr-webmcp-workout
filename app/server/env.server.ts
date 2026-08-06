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

export type AppEnv = Env & Partial<Secrets>;

const secretsSchema = z.object({
  BETTER_AUTH_SECRET: z
    .string()
    .min(32, "BETTER_AUTH_SECRET must be at least 32 characters"),
  GOOGLE_CLIENT_ID: z.string().min(1, "GOOGLE_CLIENT_ID is required"),
  GOOGLE_CLIENT_SECRET: z.string().min(1, "GOOGLE_CLIENT_SECRET is required"),
});

const appUrlSchema = z
  .url({ error: "APP_URL must be an absolute URL" })
  .refine((value) => !value.endsWith("/"), {
    error: "APP_URL must not have a trailing slash",
  });

export interface AppConfig extends Secrets {
  appUrl: string;
  /** Cookies are only marked `Secure` when the deployment is actually HTTPS. */
  useSecureCookies: boolean;
}

/**
 * Validates configuration once per isolate and fails loudly if a deployment is
 * missing a secret, rather than silently degrading to an insecure default.
 */
export function readConfig(env: AppEnv): AppConfig {
  const secrets = secretsSchema.safeParse({
    BETTER_AUTH_SECRET: env.BETTER_AUTH_SECRET,
    GOOGLE_CLIENT_ID: env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: env.GOOGLE_CLIENT_SECRET,
  });

  if (!secrets.success) {
    const detail = secrets.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(
      `Server is misconfigured. ${detail}. See README.md for the required secrets.`,
    );
  }

  const appUrl = appUrlSchema.parse(env.APP_URL);

  return {
    ...secrets.data,
    appUrl,
    useSecureCookies: appUrl.startsWith("https://"),
  };
}
