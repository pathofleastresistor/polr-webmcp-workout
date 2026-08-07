import { Form, Link, redirect, useNavigation } from "react-router";

import { AppShell } from "~/components/AppShell";
import { InsightsPanel } from "~/components/InsightsPanel";
import { LocalTime } from "~/components/LocalTime";
import { WorkoutHistory } from "~/components/WorkoutHistory";
import { useHydrated } from "~/lib/use-hydrated";
import { getAppContext } from "~/server/context";
import { readActor } from "~/server/api-handler.server";
import { listRecentEvents, recordEvent } from "~/server/services/audit.server";
import { toErrorResponse } from "~/server/services/errors";
import { getInsights } from "~/server/services/insights.server";
import {
  getActiveWorkout,
  listWorkouts,
  startWorkout,
} from "~/server/services/workouts.server";
import { requireUser } from "~/server/session.server";
import { useAccountTools } from "~/webmcp/tools/useAccountTools";

import type { Route } from "./+types/dashboard";

export function meta(): Route.MetaDescriptors {
  return [{ title: "Dashboard — Spotter" }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = await requireUser(request, context);
  const { db } = getAppContext(context);

  const [workouts, active, insights, events] = await Promise.all([
    listWorkouts(db, user.id, { limit: 10, status: "completed" }),
    getActiveWorkout(db, user.id),
    getInsights(db, user.id, user.profile, { weeks: 8 }),
    listRecentEvents(db, user.id, 10),
  ]);

  return {
    demoMode: getAppContext(context).config.demoMode,
    profile: {
      id: user.id,
      name: user.name,
      email: user.email,
      image: user.image,
      unitSystem: user.profile.unitSystem,
      experienceLevel: user.profile.experienceLevel,
      goal: user.profile.goal,
      timezone: user.profile.timezone,
      weeklyTargetSessions: user.profile.weeklyTargetSessions,
    },
    workouts,
    active,
    insights,
    events,
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const user = await requireUser(request, context);
  const { db } = getAppContext(context);

  try {
    const created = await startWorkout(db, user.id, {}, "human");

    await recordEvent(db, {
      userId: user.id,
      workoutId: created.id,
      toolName: "start_workout",
      actor: readActor(request),
      summary: `Started "${created.title}"`,
    });

    return redirect(`/workout/${created.id}`);
  } catch (error) {
    // A session is already running — send them to it rather than erroring out.
    const active = await getActiveWorkout(db, user.id);
    if (active) return redirect(`/workout/${active.id}`);
    return toErrorResponse(error);
  }
}

export default function Dashboard({ loaderData }: Route.ComponentProps) {
  const { profile, workouts, active, insights, events, demoMode } = loaderData;
  const navigation = useNavigation();
  const starting = navigation.formAction === "/dashboard";

  // Registers the read tools plus start_workout for as long as the person is
  // signed in and on this page.
  useAccountTools();

  const hydrated = useHydrated();

  return (
    <AppShell user={profile} demoMode={demoMode}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            {/* Which greeting is right depends on the visitor's clock, not the
                container's, so it settles on hydration alongside the
                timestamps — see `useHydrated`. */}
            {hydrated ? greeting() : "Hello"}, {profile.name.split(" ")[0]}
          </h1>
          <p className="mt-2 text-slate-400">
            {insights.daysSinceLastWorkout === null
              ? "No sessions logged yet. Start one, then ask your agent to program it."
              : insights.daysSinceLastWorkout === 0
                ? "You trained today."
                : `Last session ${insights.daysSinceLastWorkout} day(s) ago.`}
          </p>
        </div>

        {active ? (
          <Link
            to={`/workout/${active.id}`}
            className="rounded-xl bg-amber-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-300"
          >
            Resume &ldquo;{active.title}&rdquo;
          </Link>
        ) : (
          <Form method="post">
            <button
              type="submit"
              disabled={starting}
              className="rounded-xl bg-sky-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-sky-400 disabled:opacity-60"
            >
              {starting ? "Starting…" : "Start a workout"}
            </button>
          </Form>
        )}
      </div>

      <p className="mt-4 rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-3 text-sm text-slate-400">
        <span aria-hidden="true">✦</span> Try asking your agent:{" "}
        <em className="text-slate-300">
          &ldquo;Look at my recent training and start a session that hits what
          I&apos;ve been neglecting.&rdquo;
        </em>
      </p>

      <div className="mt-10 grid gap-8 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-8">
          <InsightsPanel insights={insights} unitSystem={profile.unitSystem} />
          <WorkoutHistory workouts={workouts} unitSystem={profile.unitSystem} />
        </div>

        <aside>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
            Activity log
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Everything done on your account, by you or your agent.
          </p>
          {events.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">Nothing recorded yet.</p>
          ) : (
            <ol className="mt-4 space-y-3">
              {events.map((event) => (
                <li
                  key={event.id}
                  className="rounded-lg border border-slate-800 bg-slate-900/40 p-3"
                >
                  <p className="text-sm text-slate-200">{event.summary}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    <span
                      className={
                        event.actor === "agent"
                          ? "text-sky-400"
                          : "text-slate-400"
                      }
                    >
                      {event.actor === "agent" ? "your agent" : "you"}
                    </span>{" "}
                    · <LocalTime value={event.createdAt} style="dateTime" />
                  </p>
                </li>
              ))}
            </ol>
          )}
        </aside>
      </div>
    </AppShell>
  );
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}
