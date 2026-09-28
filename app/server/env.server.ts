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
  /** Path to the SQLite file holding everything. */
  DATABASE_PATH?: string;
}

/** Relative to the working directory, so a bare `npm start` just works. */
export const DEFAULT_DATABASE_PATH = "./data/spotter.db";

const appUrlSchema = z
  .url({ error: "APP_URL must be an absolute URL" })
  .refine((value) => !value.endsWith("/"), {
    error: "APP_URL must not have a trailing slash",
  });

export interface AppConfig {
  appUrl: string;
  /** Drives HSTS: only sent when the deployment is actually HTTPS. */
  isHttps: boolean;
  /** Path to the SQLite file. */
  databasePath: string;
}

/** Validates configuration at startup and fails loudly if it is wrong. */
export function readConfig(env: AppEnv): AppConfig {
  const appUrl = appUrlSchema.safeParse(env.APP_URL);
  if (!appUrl.success) {
    throw new Error(
      `Server is misconfigured. APP_URL: ${appUrl.error.issues[0]?.message ?? "is required"}. See README.md.`,
    );
  }

  return {
    appUrl: appUrl.data,
    isHttps: appUrl.data.startsWith("https://"),
    databasePath: env.DATABASE_PATH?.trim() || DEFAULT_DATABASE_PATH,
  };
}
