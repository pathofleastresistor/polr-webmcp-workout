import { Form, Link, redirect, useNavigation } from "react-router";

import { AppShell } from "~/components/AppShell";
import { InsightsPanel } from "~/components/InsightsPanel";
import { PrivateLink } from "~/components/PrivateLink";
import { WorkoutHistory } from "~/components/WorkoutHistory";
import { useLinkPath } from "~/lib/link";
import { requireUser } from "~/server/access.server";
import { readActor } from "~/server/api-handler.server";
import { getAppContext } from "~/server/context";
import { listRecentEvents, recordEvent } from "~/server/services/audit.server";
import { toErrorResponse } from "~/server/services/errors";
import { getInsights } from "~/server/services/insights.server";
import {
  getActiveWorkout,
  listWorkouts,
  startWorkout,
} from "~/server/services/workouts.server";
import { useAccountTools } from "~/webmcp/tools/useAccountTools";

import type { Route } from "./+types/dashboard";

export function meta(): Route.MetaDescriptors {
  return [{ title: "Spotter" }];
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const user = await requireUser(request, context);
  const { db, config } = getAppContext(context);

  const [workouts, active, insights, events] = await Promise.all([
    listWorkouts(db, user.id, { limit: 10, status: "completed" }),
    getActiveWorkout(db, user.id),
    getInsights(db, user.id, user.profile, { weeks: 8 }),
    listRecentEvents(db, user.id, 10),
  ]);

  return {
    url: `${config.appUrl}/w/${params.key}`,
    unitSystem: user.profile.unitSystem,
    workouts,
    active,
    insights,
    events,
  };
}

export async function action({ request, context, params }: Route.ActionArgs) {
  const user = await requireUser(request, context);
  const { db } = getAppContext(context);
  const workoutPath = (id: string) => `/w/${params.key}/workout/${id}`;

  try {
    // `ifActive: "error"` keeps the button meaning what it looks like it means.
    // A person clicking "Start a workout" is not asking to end one they have
    // running — and they cannot be, because this button is replaced by "Resume"
    // whenever there is one. The catch below covers the race where a session
    // began in another tab after this page rendered.
    const created = await startWorkout(
      db,
      user.id,
      { ifActive: "error" },
      "human",
    );

    await recordEvent(db, {
      userId: user.id,
      workoutId: created.id,
      toolName: "start_workout",
      actor: readActor(request),
      summary: `Started "${created.title}"`,
    });

    return redirect(workoutPath(created.id));
  } catch (error) {
    // A session is already running — send them to it rather than erroring out.
    const active = await getActiveWorkout(db, user.id);
    if (active) return redirect(workoutPath(active.id));
    return toErrorResponse(error);
  }
}

export default function Dashboard({ loaderData }: Route.ComponentProps) {
  const { url, unitSystem, workouts, active, insights, events } = loaderData;
  const linkPath = useLinkPath();
  const navigation = useNavigation();
  const starting = navigation.state === "submitting";

  // Registers the read tools plus start_workout while this page is open.
  useAccountTools();

  const isNew = active === null && workouts.length === 0;

  return (
    <AppShell>
      {isNew && (
        <div className="mb-12">
          <PrivateLink url={url} title="Bookmark this page">
            This link is your account. There is no sign-in and no way to get it
            back, so save it somewhere. Anyone who has it can see and change
            your workouts.
          </PrivateLink>
        </div>
      )}

      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <h1 className="display">{headline(insights.daysSinceLastWorkout)}</h1>
          <p className="mt-2 text-ink-muted">
            Start one here, or ask your agent to plan it.
          </p>
        </div>

        {active ? (
          <Link
            to={linkPath(`/workout/${active.id}`)}
            className="btn btn-primary"
          >
            Resume &ldquo;{active.title}&rdquo;
          </Link>
        ) : (
          <Form method="post">
            <button
              type="submit"
              disabled={starting}
              className="btn btn-primary"
            >
              {starting ? "Starting…" : "Start a workout"}
            </button>
          </Form>
        )}
      </div>

      <div className="mt-12 grid gap-12 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-12">
          {insights.totalWorkouts > 0 && (
            <InsightsPanel insights={insights} unitSystem={unitSystem} />
          )}
          <WorkoutHistory workouts={workouts} unitSystem={unitSystem} />
        </div>

        <aside>
          <h2 className="title">Activity</h2>
          <p className="caption mt-1">What you and your agent have done.</p>
          {events.length === 0 ? (
            <p className="mt-4 text-ink-muted">Nothing yet.</p>
          ) : (
            <ol className="mt-4 divide-y divide-line">
              {events.map((event) => (
                <li key={event.id} className="py-3">
                  <p>{event.summary}</p>
                  <p className="caption mt-0.5">
                    <span
                      className={
                        event.actor === "agent" ? "text-sky-text" : undefined
                      }
                    >
                      {event.actor === "agent" ? "Your agent" : "You"}
                    </span>{" "}
                    · {new Date(event.createdAt).toLocaleString()}
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

function headline(daysSince: number | null): string {
  if (daysSince === null) return "No workouts yet";
  if (daysSince === 0) return "You trained today";
  if (daysSince === 1) return "Last workout yesterday";
  return `Last workout ${daysSince} days ago`;
}
