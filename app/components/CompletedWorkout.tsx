import { Link } from "react-router";

import type { UnitSystem } from "~/db/schema";
import type { WorkoutDetailView } from "~/domain/types";
import { useLinkPath } from "~/lib/link";
import { formatVolume, formatWeight } from "~/lib/units";

/** Read-only view of a session that has been finished or discarded. */
export function CompletedWorkout({
  workout,
  unitSystem,
}: {
  workout: WorkoutDetailView;
  unitSystem: UnitSystem;
}) {
  const linkPath = useLinkPath();
  const abandoned = workout.status === "abandoned";

  return (
    <div className="mt-8">
      <div
        className={
          abandoned
            ? "rounded-lg bg-surface-sunken p-6"
            : "rounded-lg bg-brand-soft p-6"
        }
      >
        <h2 className="title">
          {abandoned ? "Workout discarded" : "Workout done"}
        </h2>
        <p className="mt-1">
          {abandoned
            ? "It doesn't count toward your history."
            : `${workout.completedSets} sets · ${formatVolume(workout.totalVolumeKg, unitSystem)}${
                workout.durationMinutes !== null
                  ? ` · ${workout.durationMinutes} min`
                  : ""
              }`}
        </p>
      </div>

      {workout.notes && (
        <p className="card mt-6 whitespace-pre-line text-ink-muted">
          {workout.notes}
        </p>
      )}

      {workout.exercises.length > 0 && (
        <ol className="mt-6 space-y-4">
          {workout.exercises.map((entry) => (
            <li key={entry.id} className="card">
              <h3 className="title">{entry.exercise.name}</h3>
              <ul className="mt-3 flex flex-wrap gap-2">
                {entry.sets.map((set) => (
                  <li
                    key={set.id}
                    className={
                      set.status === "completed"
                        ? "badge badge-neutral tabular-nums"
                        : "badge badge-neutral text-ink-muted tabular-nums line-through"
                    }
                  >
                    {formatWeight(set.weightKg, unitSystem)} × {set.reps ?? "—"}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      )}

      <Link to={linkPath()} className="btn btn-secondary mt-8">
        Back to your page
      </Link>
    </div>
  );
}
