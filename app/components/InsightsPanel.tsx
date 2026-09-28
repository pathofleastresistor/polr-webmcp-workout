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
      <h2 className="heading">Last {insights.windowWeeks} weeks</h2>

      <dl className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
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
      </dl>

      {/*
        Keyed on work actually done, not on the length of the list: every
        trainable group is always present so an agent can see the gaps, so a
        brand-new page would otherwise render a chart of empty bars.
      */}
      {insights.totalSets > 0 && (
        <div className="mt-8">
          <h3 className="title">Where the work went</h3>
          <ul className="mt-4 space-y-3">
            {insights.muscleGroupLoad.map((item) => (
              <li key={item.muscleGroup} className="flex items-center gap-3">
                <span className="w-24 shrink-0 text-ink-muted">
                  {MUSCLE_LABELS[item.muscleGroup] ?? item.muscleGroup}
                </span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-sunken">
                  <div
                    className="h-full rounded-full bg-brand"
                    style={{
                      width: `${maxSets > 0 ? (item.sets / maxSets) * 100 : 0}%`,
                    }}
                  />
                </div>
                <span className="caption w-24 shrink-0 text-right tabular-nums">
                  {item.sets} sets ·{" "}
                  {item.daysSinceLastTrained === null
                    ? "never"
                    : `${item.daysSinceLastTrained}d`}
                </span>
              </li>
            ))}
          </ul>

          {insights.underworkedMuscleGroups.length > 0 && (
            <p className="mt-4 text-ink-muted">
              Least recently trained:{" "}
              <span className="font-semibold text-ink">
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
          <h3 className="title">Best estimated 1RM</h3>
          <ul className="mt-4 grid gap-x-6 sm:grid-cols-2">
            {insights.personalRecords.slice(0, 6).map((record) => (
              <li
                key={record.exerciseId}
                className="flex items-baseline justify-between border-b border-line py-2"
              >
                <span>{record.exerciseName}</span>
                <span className="font-semibold tabular-nums">
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
    <div className="card p-4">
      <dt className="caption">{label}</dt>
      <dd className="mt-1 font-display text-2xl font-bold whitespace-nowrap tabular-nums">
        {value}
      </dd>
      {hint && <dd className="caption text-brand-text">{hint}</dd>}
    </div>
  );
}
