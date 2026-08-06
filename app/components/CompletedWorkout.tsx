import { Link } from "react-router";

import type { UnitSystem } from "~/db/schema";
import type { WorkoutDetailView } from "~/domain/types";
import { formatVolume, formatWeight } from "~/lib/units";

/** Read-only view of a session that has been finished or discarded. */
export function CompletedWorkout({
  workout,
  unitSystem,
}: {
  workout: WorkoutDetailView;
  unitSystem: UnitSystem;
}) {
  const abandoned = workout.status === "abandoned";

  return (
    <div className="mt-8">
      <div
        className={
          abandoned
            ? "rounded-2xl border border-slate-800 bg-slate-900/40 p-6"
            : "rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-6"
        }
      >
        <h2 className="text-lg font-semibold">
          {abandoned ? "Session discarded" : "Session complete"}
        </h2>
        <p className="mt-1 text-sm text-slate-400">
          {abandoned
            ? "This one was discarded and does not count toward your training history."
            : `${workout.completedSets} set(s) · ${formatVolume(workout.totalVolumeKg, unitSystem)}${
                workout.durationMinutes !== null
                  ? ` · ${workout.durationMinutes} minutes`
                  : ""
              }`}
        </p>
      </div>

      {workout.notes && (
        <p className="mt-6 whitespace-pre-line rounded-xl border border-slate-800 bg-slate-900/40 p-4 text-sm text-slate-300">
          {workout.notes}
        </p>
      )}

      {workout.exercises.length > 0 && (
        <ol className="mt-6 space-y-4">
          {workout.exercises.map((entry) => (
            <li
              key={entry.id}
              className="rounded-xl border border-slate-800 bg-slate-900/40 p-4"
            >
              <h3 className="font-medium">{entry.exercise.name}</h3>
              <ul className="mt-2 flex flex-wrap gap-2">
                {entry.sets.map((set) => (
                  <li
                    key={set.id}
                    className={
                      set.status === "completed"
                        ? "rounded-md bg-slate-950/60 px-2 py-1 text-xs tabular-nums text-slate-200"
                        : "rounded-md bg-slate-950/60 px-2 py-1 text-xs tabular-nums text-slate-600 line-through"
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

      <div className="mt-8">
        <Link
          to="/dashboard"
          className="rounded-xl bg-sky-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-sky-400"
        >
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
