import { redirect } from "react-router";

import { getAppContext } from "~/server/context";
import { enforceRateLimit, rateLimitKey } from "~/server/rate-limit.server";
import { seedDemoData } from "~/server/services/demo.server";

import type { Route } from "./+types/demo.start";

/**
 * One-click throwaway account, for exploring the app before a Google OAuth
 * client exists.
 *
 * Each visitor gets their own isolated user rather than sharing one demo login,
 * so two people clicking around at once cannot see or overwrite each other's
 * sessions. The password is generated here, never displayed, and never reused —
 * it exists only because Better Auth needs a credential to mint a session.
 */
export async function action({ request, context }: Route.ActionArgs) {
  const { auth, db, config } = getAppContext(context);

  // Fails closed. When DEMO_MODE is unset this route does not exist at all,
  // which is the behaviour a real deployment must have.
  if (!config.demoMode) {
    throw new Response("Not found", { status: 404 });
  }

  // Each call creates a user and writes ~100 rows, so it is worth bounding even
  // though the accounts are disposable.
  await enforceRateLimit("AUTH_RATE_LIMIT", rateLimitKey(request, null));

  const handle = crypto.randomUUID().slice(0, 8);

  const response = await auth.api.signUpEmail({
    body: {
      // Reserved by RFC 2606, so a demo account can never collide with or
      // shadow a real person's address.
      email: `demo-${handle}@example.com`,
      password: crypto.randomUUID() + crypto.randomUUID(),
      name: "Demo Athlete",
    },
    headers: request.headers,
    asResponse: true,
  });

  if (!response.ok) {
    console.error(
      "Demo sign-up failed",
      response.status,
      await response.clone().text(),
    );
    throw new Response("Could not start the demo. Please try again.", {
      status: 502,
    });
  }

  // Read the id from the sign-up body rather than calling getSession with these
  // headers: they carry Set-Cookie, and getSession wants a request Cookie
  // header, so it would always come back empty.
  const created = (await response.json()) as { user?: { id?: string } };
  const userId = created.user?.id;

  if (!userId) {
    console.error("Demo sign-up returned no user");
    throw new Response("Could not start the demo session.", { status: 502 });
  }

  await seedDemoData(db, userId);

  // Forward Better Auth's Set-Cookie so the browser lands on the dashboard
  // already signed in.
  return redirect("/dashboard", { headers: response.headers });
}

/** Nothing to render; the button POSTs here. */
export function loader() {
  throw new Response("Not found", { status: 404 });
}
