import { createContext, type RouterContextProvider } from "react-router";

import { getDatabase, type Database } from "~/db";

import { createAuth, type Auth } from "./auth.server";
import { readConfig, type AppConfig, type AppEnv } from "./env.server";

export interface AppContext {
  env: AppEnv;
  config: AppConfig;
  db: Database;
  auth: Auth;
}

export const appContext = createContext<AppContext>();

/**
 * Builds the application context.
 *
 * Under Workers this ran per request, because the D1 binding only existed on
 * the request's `env`. On Node the database handle and the validated config are
 * process-wide, so this is memoised: reopening SQLite and re-parsing the
 * environment on every request would be pure overhead.
 *
 * Better Auth is built here too, since it closes over both.
 */
let cached: AppContext | null = null;

export function createAppContext(env: AppEnv = process.env): AppContext {
  if (cached) return cached;

  const config = readConfig(env);
  const db = getDatabase(config.databasePath);
  const auth = createAuth(db, config);

  cached = { env, config, db, auth };
  return cached;
}

/** Tests build contexts against throwaway databases; production never resets. */
export function resetAppContext(): void {
  cached = null;
}

export function getAppContext(context: Readonly<RouterContextProvider>) {
  return context.get(appContext);
}
