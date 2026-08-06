import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

import type { Database } from "~/db";
import { account, session, user, verification } from "~/db/schema";

import type { AppConfig } from "./env.server";

export type Auth = ReturnType<typeof createAuth>;

const THIRTY_DAYS_SECONDS = 60 * 60 * 24 * 30;
const ONE_DAY_SECONDS = 60 * 60 * 24;

/**
 * Better Auth instance backed by D1.
 *
 * Built per request because the D1 binding is request-scoped. Better Auth
 * construction is cheap (no connections to open) so this is not a hot path.
 */
export function createAuth(db: Database, config: AppConfig) {
  return betterAuth({
    appName: "Spotter",
    secret: config.BETTER_AUTH_SECRET,
    baseURL: config.appUrl,
    basePath: "/api/auth",

    database: drizzleAdapter(db, {
      provider: "sqlite",
      // D1 has no interactive transactions; the adapter must issue statements
      // sequentially rather than wrapping them in BEGIN/COMMIT.
      transaction: false,
      schema: { user, session, account, verification },
    }),

    // Google is the only identity provider. Email/password is deliberately off:
    // no password hashes to store, leak, or rotate.
    emailAndPassword: { enabled: false },
    socialProviders: {
      google: {
        clientId: config.GOOGLE_CLIENT_ID,
        clientSecret: config.GOOGLE_CLIENT_SECRET,
        // Google verifies the address before it reaches us.
        mapProfileToUser: (profile) => ({
          name: profile.name || profile.email,
          email: profile.email,
          image: profile.picture,
          emailVerified: profile.email_verified ?? false,
        }),
      },
    },

    session: {
      expiresIn: THIRTY_DAYS_SECONDS,
      // Sliding expiry: an active session is refreshed at most once a day.
      updateAge: ONE_DAY_SECONDS,
      cookieCache: {
        enabled: true,
        maxAge: 60 * 5,
      },
    },

    account: {
      accountLinking: {
        // Only link accounts whose email Google has verified.
        enabled: true,
        trustedProviders: ["google"],
      },
    },

    advanced: {
      useSecureCookies: config.useSecureCookies,
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
      },
      // Cookies are scoped to this exact origin; no subdomain sharing.
      crossSubDomainCookies: { enabled: false },
    },

    // Only our own origin may drive the auth endpoints.
    trustedOrigins: [config.appUrl],

    telemetry: { enabled: false },
  });
}
