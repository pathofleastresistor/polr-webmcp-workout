import { LocalTime } from "~/components/LocalTime";
import type { UnitSystem } from "~/db/schema";
import type { WorkoutSummaryView } from "~/domain/types";
import { formatVolume } from "~/lib/units";

export function WorkoutHistory({
  workouts,
  unitSystem,
}: {
  workouts: WorkoutSummaryView[];
  unitSystem: UnitSystem;
}) {
  return (
    <section>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
        Recent workouts
      </h2>

      {workouts.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-slate-800 p-6 text-center text-sm text-slate-500">
          Nothing here yet. Your first finished session will show up here and
          start feeding your agent&apos;s suggestions.
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {workouts.map((workout) => (
            <li
              key={workout.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-3"
            >
              <div>
                <p className="font-medium text-slate-100">
                  {workout.title}
                  {workout.plannedBy === "agent" && (
                    <span
                      className="ml-2 rounded-full bg-sky-500/10 px-2 py-0.5 text-[11px] font-normal text-sky-300 ring-1 ring-sky-500/30"
                      title="This session was planned by your agent"
                    >
                      agent-planned
                    </span>
                  )}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  <LocalTime value={workout.startedAt} style="weekdayDate" />
                  {workout.durationMinutes !== null &&
                    ` · ${workout.durationMinutes} min`}
                </p>
              </div>

              <div className="flex items-center gap-4 text-sm tabular-nums text-slate-400">
                <span>{workout.exerciseCount} exercises</span>
                <span>{workout.completedSets} sets</span>
                <span className="text-slate-200">
                  {formatVolume(workout.totalVolumeKg, unitSystem)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
