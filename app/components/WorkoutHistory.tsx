import { Link } from "react-router";

import type { UnitSystem } from "~/db/schema";
import type { WorkoutSummaryView } from "~/domain/types";
import { useLinkPath } from "~/lib/link";
import { formatVolume } from "~/lib/units";

export function WorkoutHistory({
  workouts,
  unitSystem,
}: {
  workouts: WorkoutSummaryView[];
  unitSystem: UnitSystem;
}) {
  const linkPath = useLinkPath();

  return (
    <section>
      <h2 className="heading">Recent workouts</h2>

      {workouts.length === 0 ? (
        <p className="mt-4 text-ink-muted">Finished workouts show up here.</p>
      ) : (
        <ul className="mt-6 space-y-3">
          {workouts.map((workout) => (
            <li key={workout.id}>
              <Link
                to={linkPath(`/workout/${workout.id}`)}
                className="card flex flex-wrap items-center justify-between gap-3 px-6 py-4 transition hover:-translate-y-0.5 hover:shadow-lift motion-reduce:hover:translate-y-0"
              >
                <div>
                  <p className="font-semibold">
                    {workout.title}
                    {workout.plannedBy === "agent" && (
                      <span className="badge badge-sky ml-2 align-middle">
                        Agent planned
                      </span>
                    )}
                  </p>
                  <p className="caption mt-0.5">
                    {new Date(workout.startedAt).toLocaleDateString(undefined, {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                    })}
                    {workout.durationMinutes !== null &&
                      ` · ${workout.durationMinutes} min`}
                  </p>
                </div>

                <div className="flex items-center gap-4 text-ink-muted tabular-nums">
                  <span>{workout.completedSets} sets</span>
                  <span className="font-semibold text-ink">
                    {formatVolume(workout.totalVolumeKg, unitSystem)}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
