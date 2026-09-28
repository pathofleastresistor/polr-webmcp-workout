import { Form, redirect, useNavigation } from "react-router";

import { getAppContext } from "~/server/context";
import { enforceRateLimit, rateLimitKey } from "~/server/rate-limit.server";
import { createUser } from "~/server/services/users.server";
import { useAnonymousTools } from "~/webmcp/tools/useAnonymousTools";

import type { Route } from "./+types/home";

export function meta(): Route.MetaDescriptors {
  return [
    { title: "Spotter" },
    {
      name: "description",
      content: "A workout log you and your agent share.",
    },
  ];
}

/**
 * Makes a new person and sends them to their link.
 *
 * A POST rather than a visit to `/` so crawlers and link previews do not mint
 * accounts. Rate limited per IP for the same reason.
 */
export async function action({ request, context }: Route.ActionArgs) {
  const { db } = getAppContext(context);

  await enforceRateLimit("ANON_RATE_LIMIT", rateLimitKey(request, null));

  const { key } = await createUser(db);
  return redirect(`/w/${key}`);
}

export default function Home() {
  const navigation = useNavigation();
  const creating = navigation.state !== "idle";

  // The landing page is itself an agent surface: an agent that arrives here can
  // learn what the service does and that making a page is the person's job.
  useAnonymousTools();

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-20">
      <h1 className="display-xl">Spotter</h1>
      <p className="mt-4 text-lg text-ink-muted">
        A workout log you and your agent share.
      </p>

      <Form method="post" className="mt-8">
        <button type="submit" disabled={creating} className="btn btn-primary">
          {creating ? "Making your page…" : "Make my page"}
        </button>
      </Form>

      <p className="caption mt-4">
        You get a private link. Bookmark it: it is the only way back, and anyone
        who has it can see and change your workouts.
      </p>
    </main>
  );
}
