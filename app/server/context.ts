import { createContext, type RouterContextProvider } from "react-router";

import { createDatabase, type Database } from "~/db";

import { createAuth, type Auth } from "./auth.server";
import { readConfig, type AppConfig, type AppEnv } from "./env.server";

export interface AppContext {
  env: AppEnv;
  /** Cloudflare execution context, for `waitUntil` on fire-and-forget writes. */
  executionCtx: ExecutionContext;
  config: AppConfig;
  db: Database;
  auth: Auth;
}

export const appContext = createContext<AppContext>();

/**
 * Builds the per-request context. D1 bindings are request-scoped, so the
 * Drizzle client and the Better Auth instance are constructed here rather than
 * memoized at module scope.
 */
export function createAppContext(
  env: AppEnv,
  executionCtx: ExecutionContext,
): AppContext {
  const config = readConfig(env);
  const db = createDatabase(env.DB);
  const auth = createAuth(db, config);

  return { env, executionCtx, config, db, auth };
}

export function getAppContext(context: Readonly<RouterContextProvider>) {
  return context.get(appContext);
}
