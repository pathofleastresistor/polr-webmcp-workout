import type { UnitSystem } from "~/db/schema";
import type { InsightsView } from "~/domain/types";
import { formatVolume, formatWeight } from "~/lib/units";

const MUSCLE_LABELS: Record<string, string> = {
  chest: "Chest",
  back: "Back",
  shoulders: "Shoulders",
  biceps: "Biceps",
  triceps: "Triceps",
  quads: "Quads",
  hamstrings: "Hamstrings",
  glutes: "Glutes",
  calves: "Calves",
  core: "Core",
  full_body: "Full body",
  cardio: "Cardio",
};

export function InsightsPanel({
  insights,
  unitSystem,
}: {
  insights: InsightsView;
  unitSystem: UnitSystem;
}) {
  const maxSets = insights.muscleGroupLoad.reduce(
    (max, item) => Math.max(max, item.sets),
    0,
  );

  return (
    <section>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
        Last {insights.windowWeeks} weeks
      </h2>

      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Workouts" value={String(insights.totalWorkouts)} />
        <Stat label="Sets" value={String(insights.totalSets)} />
        <Stat
          label="Volume"
          value={formatVolume(insights.totalVolumeKg, unitSystem)}
        />
        <Stat
          label="Per week"
          value={`${insights.averageSessionsPerWeek} / ${insights.weeklyTargetSessions}`}
          hint={
            insights.currentStreakWeeks > 0
              ? `${insights.currentStreakWeeks}-week streak`
              : undefined
          }
        />
      </div>

      {/*
        Keyed on work actually done, not on the length of the list: every
        trainable group is now always present so an agent can see the gaps, so
        a brand-new account would otherwise render a chart of ten empty bars.
      */}
      {insights.totalSets > 0 && (
        <div className="mt-8">
          <h3 className="text-sm font-medium text-slate-300">
            Where the work went
          </h3>
          <ul className="mt-3 space-y-2">
            {insights.muscleGroupLoad.map((item) => (
              <li key={item.muscleGroup} className="flex items-center gap-3">
                <span className="w-24 shrink-0 text-sm text-slate-400">
                  {MUSCLE_LABELS[item.muscleGroup] ?? item.muscleGroup}
                </span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-800">
                  <div
                    className="h-full rounded-full bg-sky-500/70"
                    style={{
                      width: `${maxSets > 0 ? (item.sets / maxSets) * 100 : 0}%`,
                    }}
                  />
                </div>
                <span className="w-28 shrink-0 text-right text-xs text-slate-500">
                  {item.sets} sets ·{" "}
                  {item.daysSinceLastTrained === null
                    ? "—"
                    : `${item.daysSinceLastTrained}d`}
                </span>
              </li>
            ))}
          </ul>

          {insights.underworkedMuscleGroups.length > 0 && (
            <p className="mt-4 rounded-lg bg-slate-900/60 px-3 py-2 text-sm text-slate-400">
              Least recently trained:{" "}
              <span className="text-slate-200">
                {insights.underworkedMuscleGroups
                  .map((group) => MUSCLE_LABELS[group] ?? group)
                  .join(", ")}
              </span>
            </p>
          )}
        </div>
      )}

      {insights.personalRecords.length > 0 && (
        <div className="mt-8">
          <h3 className="text-sm font-medium text-slate-300">
            Best estimated 1RM
          </h3>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {insights.personalRecords.slice(0, 6).map((record) => (
              <li
                key={record.exerciseId}
                className="flex items-baseline justify-between rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2"
              >
                <span className="text-sm text-slate-300">
                  {record.exerciseName}
                </span>
                <span className="text-sm font-medium text-slate-100">
                  {formatWeight(record.estimatedOneRepMaxKg, unitSystem)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-emerald-400">{hint}</p>}
    </div>
  );
}
