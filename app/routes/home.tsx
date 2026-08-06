import { Form, redirect } from "react-router";

import { Logo } from "~/components/AppShell";
import { getAppContext } from "~/server/context";
import { enforceRateLimit, rateLimitKey } from "~/server/rate-limit.server";
import { getOptionalUser } from "~/server/session.server";
import { AgentConsole } from "~/components/AgentConsole";
import { useAnonymousTools } from "~/webmcp/tools/useAnonymousTools";

import type { Route } from "./+types/home";

export function meta(): Route.MetaDescriptors {
  return [
    { title: "Spotter — a workout coach you and your agent share" },
    {
      name: "description",
      content:
        "Plan, run and track strength training with your AI agent working alongside you. Built on WebMCP so your agent can read your history, suggest a session and log every set.",
    },
  ];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = await getOptionalUser(request, context);
  if (user) throw redirect("/dashboard");

  const { config } = getAppContext(context);
  return {
    googleEnabled: config.googleEnabled,
    demoMode: config.demoMode,
  };
}

/**
 * Kicks off Google's OAuth flow.
 *
 * Handled server-side rather than through a client SDK: Better Auth mints the
 * PKCE verifier and state cookie as part of building the redirect, so the
 * browser never holds anything it could leak.
 */
export async function action({ request, context }: Route.ActionArgs) {
  const { auth, env, config } = getAppContext(context);

  if (!config.googleEnabled) {
    throw new Response(
      "Google sign-in is not configured on this deployment. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET, or use the demo.",
      { status: 501 },
    );
  }

  await enforceRateLimit(env, "AUTH_RATE_LIMIT", rateLimitKey(request, null));

  const formData = await request.formData();
  const next = formData.get("next");

  // Only ever redirect within this app — an attacker-supplied absolute URL here
  // would turn sign-in into an open redirect.
  const callbackURL = isSafeRedirect(next) ? next : "/dashboard";

  const response = await auth.api.signInSocial({
    body: { provider: "google", callbackURL },
    headers: request.headers,
    asResponse: true,
  });

  // Better Auth answers with the provider URL plus the Set-Cookie carrying the
  // PKCE state; both have to reach the browser, so the response is forwarded
  // rather than rebuilt.
  if (response.status >= 300 && response.status < 400) return response;

  const payload = (await response
    .clone()
    .json()
    .catch(() => null)) as {
    url?: string;
  } | null;

  if (payload?.url) {
    const headers = new Headers(response.headers);
    headers.set("Location", payload.url);
    return new Response(null, { status: 302, headers });
  }

  console.error("Google sign-in did not return a redirect URL", {
    status: response.status,
    appUrl: config.appUrl,
  });
  throw new Response("Could not start sign-in. Please try again.", {
    status: 502,
  });
}

function isSafeRedirect(value: FormDataEntryValue | null): value is string {
  return (
    typeof value === "string" &&
    value.startsWith("/") &&
    // `//evil.com` is a protocol-relative URL, not a local path.
    !value.startsWith("//")
  );
}

export default function Home({ loaderData, actionData }: Route.ComponentProps) {
  const { googleEnabled, demoMode } = loaderData;
  // The landing page is itself an agent surface: an agent that arrives here can
  // discover what the service does and learn that sign-in is the person's job.
  useAnonymousTools();

  return (
    <div className="min-h-screen bg-slate-950">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[32rem] bg-[radial-gradient(60%_60%_at_50%_0%,rgba(56,189,248,0.16),transparent)]" />

      <header className="relative mx-auto flex max-w-5xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2">
          <Logo />
          <span className="text-lg font-semibold tracking-tight">Spotter</span>
        </div>
        <span className="rounded-full border border-slate-800 px-3 py-1 text-xs text-slate-400">
          WebMCP native
        </span>
      </header>

      <main className="relative mx-auto max-w-5xl px-6 pb-24">
        <section className="pt-12 sm:pt-20">
          <p className="inline-flex items-center gap-2 rounded-full bg-sky-500/10 px-3 py-1 text-sm text-sky-300 ring-1 ring-sky-500/30">
            <span aria-hidden="true">✦</span>
            Built for you and your agent, together
          </p>

          <h1 className="mt-6 max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-6xl">
            Your agent knows your training. You do the lifting.
          </h1>

          <p className="mt-6 max-w-2xl text-lg text-slate-300 text-pretty">
            Spotter is a workout tracker where your AI agent is a first-class
            user. It reads your history, programs your next session, and logs
            every set as you call it out — while you stay in control of the page
            and approve anything that matters.
          </p>

          <div className="mt-10 flex flex-col gap-4 sm:flex-row sm:items-center">
            {googleEnabled && (
              <Form method="post">
                <button
                  type="submit"
                  className="inline-flex w-full items-center justify-center gap-3 rounded-xl bg-white px-6 py-3 text-base font-semibold text-slate-900 shadow-lg transition hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400 sm:w-auto"
                >
                  <GoogleMark />
                  Continue with Google
                </button>
              </Form>
            )}

            {demoMode && (
              <Form method="post" action="/demo/start">
                <button
                  type="submit"
                  className={
                    googleEnabled
                      ? "inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-700 px-6 py-3 text-base font-medium text-slate-200 transition hover:bg-slate-900 sm:w-auto"
                      : "inline-flex w-full items-center justify-center gap-2 rounded-xl bg-sky-500 px-6 py-3 text-base font-semibold text-slate-950 shadow-lg transition hover:bg-sky-400 sm:w-auto"
                  }
                >
                  <span aria-hidden="true">✦</span>
                  Explore the demo
                </button>
              </Form>
            )}

            <p className="text-sm text-slate-400">
              {demoMode
                ? "The demo creates a throwaway account with 8 weeks of sample training. No sign-up."
                : "Free while in beta. No card required."}
            </p>
          </div>

          {actionData ? (
            <p role="alert" className="mt-4 text-sm text-rose-300">
              Sign-in could not be started. Please try again.
            </p>
          ) : null}
        </section>

        <section className="mt-24 grid gap-6 sm:grid-cols-3">
          <Feature
            title="Ask for a session"
            body="“Give me 45 minutes of upper body.” Your agent checks what you have trained recently, picks the movements, and puts a full plan on screen for you to accept or reject."
          />
          <Feature
            title="Log without touching your phone"
            body="Call out the set between reps. Your agent writes it down and tells you what is left, so your hands stay on the bar instead of the screen."
          />
          <Feature
            title="You approve what counts"
            body="Reading your history is free. Writing a plan, dropping an exercise or ending a session always stops for your confirmation first."
          />
        </section>

        <section className="mt-24 rounded-2xl border border-slate-800 bg-slate-900/40 p-8">
          <h2 className="text-2xl font-semibold tracking-tight">
            How the handoff works
          </h2>
          <ol className="mt-6 grid gap-6 sm:grid-cols-2">
            <Step
              n={1}
              title="Your agent reads the room"
              body="get_training_insights tells it your volume per muscle group, how long since each was trained, and the loads you are actually handling."
            />
            <Step
              n={2}
              title="It proposes, you decide"
              body="propose_workout_plan puts a full session on the page. Nothing is saved until you press accept."
            />
            <Step
              n={3}
              title="You lift, it writes"
              body="log_set records each set as you go. The page updates live, whether the set came from you or from your agent."
            />
            <Step
              n={4}
              title="Close it out"
              body="finish_workout ends the session and folds it into your history, ready to inform the next one."
            />
          </ol>
        </section>

        <section className="mt-16 rounded-2xl border border-slate-800 bg-slate-900/40 p-8">
          <h2 className="text-xl font-semibold tracking-tight">
            Works by hand too
          </h2>
          <p className="mt-3 max-w-2xl text-slate-300">
            Every tool your agent can call maps to a control you can press
            yourself. If you are on a browser without WebMCP, or you simply
            prefer tapping, nothing is missing — the agent is an addition, not a
            requirement.
          </p>
        </section>
      </main>

      <AgentConsole />
    </div>
  );
}

function Feature({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6">
      <h3 className="font-semibold text-slate-100">{title}</h3>
      <p className="mt-2 text-sm text-slate-400 text-pretty">{body}</p>
    </div>
  );
}

function Step({ n, title, body }: { n: number; title: string; body: string }) {
  return (
    <li className="flex gap-4">
      <span
        aria-hidden="true"
        className="grid size-8 shrink-0 place-items-center rounded-full bg-sky-500/10 text-sm font-semibold text-sky-300 ring-1 ring-sky-500/30"
      >
        {n}
      </span>
      <div>
        <h3 className="font-medium text-slate-100">{title}</h3>
        <p className="mt-1 text-sm text-slate-400 text-pretty">{body}</p>
      </div>
    </li>
  );
}

function GoogleMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5">
      <path
        fill="#4285F4"
        d="M23.52 12.27c0-.79-.07-1.54-.2-2.27H12v4.51h6.47a5.54 5.54 0 0 1-2.4 3.63v3h3.87c2.27-2.09 3.58-5.17 3.58-8.87Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.08 7.94-2.91l-3.87-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.28v3.09A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.29a7.2 7.2 0 0 1 0-4.58V6.62H1.28a12 12 0 0 0 0 10.76l3.99-3.09Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.43-3.43C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.28 6.62l3.99 3.09C6.22 6.86 8.87 4.75 12 4.75Z"
      />
    </svg>
  );
}
