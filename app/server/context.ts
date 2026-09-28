import { createContext, type RouterContextProvider } from "react-router";

import { getDatabase, type Database } from "~/db";

import { readConfig, type AppConfig, type AppEnv } from "./env.server";

export interface AppContext {
  env: AppEnv;
  config: AppConfig;
  db: Database;
}

export const appContext = createContext<AppContext>();

/**
 * Builds the application context.
 *
 * The database handle and the validated config are process-wide, so this is
 * memoised: reopening SQLite and re-parsing the environment on every request
 * would be pure overhead.
 */
let cached: AppContext | null = null;

export function createAppContext(env: AppEnv = process.env): AppContext {
  if (cached) return cached;

  const config = readConfig(env);
  const db = getDatabase(config.databasePath);

  cached = { env, config, db };
  return cached;
}

/** Tests build contexts against throwaway databases; production never resets. */
export function resetAppContext(): void {
  cached = null;
}

export function getAppContext(context: Readonly<RouterContextProvider>) {
  return context.get(appContext);
}
