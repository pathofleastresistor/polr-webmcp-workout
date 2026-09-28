import { useState } from "react";
import { useFetcher } from "react-router";

import type { UnitSystem } from "~/db/schema";
import type { JsonObject } from "~/lib/json";
import type {
  SetView,
  WorkoutDetailView,
  WorkoutExerciseView,
} from "~/domain/types";
import { useLinkPath } from "~/lib/link";
import { formatVolume, fromKg, toKg, unitLabel } from "~/lib/units";

/**
 * The live session.
 *
 * Every control here maps one-to-one onto a WebMCP tool, so a set logged by
 * tapping and a set logged by the agent take the same server path and land in
 * the same place. The page is the shared surface: whichever of the two acts,
 * the other sees it immediately.
 */
export function WorkoutRunner({
  workout,
  unitSystem,
}: {
  workout: WorkoutDetailView;
  unitSystem: UnitSystem;
}) {
  const fetcher = useFetcher();
  const linkPath = useLinkPath();
  const busy = fetcher.state !== "idle";

  const totalSets = workout.exercises.reduce(
    (sum, entry) => sum + entry.sets.length,
    0,
  );
  const done = workout.exercises.reduce(
    (sum, entry) =>
      sum + entry.sets.filter((set) => set.status !== "pending").length,
    0,
  );

  const submit = (body: JsonObject, path = "") =>
    fetcher.submit(body, {
      method: "post",
      action: linkPath(`/api/workouts/${workout.id}${path}`),
      encType: "application/json",
    });

  return (
    <div className="mt-8">
      <div className="flex items-center gap-4">
        <div
          className="h-2 flex-1 overflow-hidden rounded-full bg-surface-sunken"
          role="progressbar"
          aria-valuenow={done}
          aria-valuemin={0}
          aria-valuemax={totalSets}
          aria-label="Sets completed"
        >
          <div
            className="h-full rounded-full bg-brand transition-[width]"
            style={{ width: `${totalSets ? (done / totalSets) * 100 : 0}%` }}
          />
        </div>
        <span className="caption tabular-nums">
          {done}/{totalSets} sets
        </span>
        <span className="caption tabular-nums">
          {formatVolume(workout.totalVolumeKg, unitSystem)}
        </span>
      </div>

      {workout.notes && (
        <p className="card mt-6 whitespace-pre-line text-ink-muted">
          {workout.notes}
        </p>
      )}

      <ol className="mt-8 space-y-4">
        {workout.exercises.map((entry) => (
          <ExerciseCard
            key={entry.id}
            entry={entry}
            workoutId={workout.id}
            unitSystem={unitSystem}
            busy={busy}
            onLog={(body) => submit(body, "/sets")}
            onRemove={() =>
              submit({
                op: "remove_exercise",
                workoutId: workout.id,
                workoutExerciseId: entry.id,
              })
            }
          />
        ))}
      </ol>

      <div className="mt-12 flex flex-wrap gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => submit({ op: "finish", workoutId: workout.id })}
          className="btn btn-primary"
        >
          Finish workout
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            if (
              !confirm(
                "Discard this workout? It will not count toward your training history.",
              )
            ) {
              return;
            }
            submit({ op: "cancel", workoutId: workout.id });
          }}
          className="btn btn-secondary"
        >
          Discard
        </button>
      </div>
    </div>
  );
}

function ExerciseCard({
  entry,
  workoutId,
  unitSystem,
  busy,
  onLog,
  onRemove,
}: {
  entry: WorkoutExerciseView;
  workoutId: string;
  unitSystem: UnitSystem;
  busy: boolean;
  onLog: (body: JsonObject) => void;
  onRemove: () => void;
}) {
  const remaining = entry.sets.filter((set) => set.status === "pending").length;

  return (
    <li className="card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="title">{entry.exercise.name}</h3>
          <p className="caption mt-0.5 capitalize">
            {entry.exercise.primaryMuscle.replace("_", " ")} ·{" "}
            {entry.exercise.equipment}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="caption">
            {remaining === 0 ? "Done" : `${remaining} left`}
          </span>
          <button
            type="button"
            onClick={onRemove}
            disabled={busy}
            className="btn btn-sm btn-ghost"
            aria-label={`Remove ${entry.exercise.name}`}
          >
            Remove
          </button>
        </div>
      </div>

      {entry.rationale && (
        <p className="mt-3 rounded-sm bg-sky-soft px-3 py-2 text-sm">
          <span className="font-semibold text-sky-text">Why: </span>
          {entry.rationale}
        </p>
      )}

      <ul className="mt-4 divide-y divide-line">
        {entry.sets.map((set) => (
          <SetRow
            key={set.id}
            set={set}
            unitSystem={unitSystem}
            busy={busy}
            onLog={(values) =>
              onLog({
                workoutId,
                workoutExerciseId: entry.id,
                setIndex: set.setIndex,
                ...values,
              })
            }
          />
        ))}
      </ul>
    </li>
  );
}

function SetRow({
  set,
  unitSystem,
  busy,
  onLog,
}: {
  set: SetView;
  unitSystem: UnitSystem;
  busy: boolean;
  onLog: (values: JsonObject) => void;
}) {
  // Inputs are seeded from the plan and held locally so the person can adjust
  // what they actually lifted before committing the set.
  const [weight, setWeight] = useState(() =>
    set.weightKg === null
      ? ""
      : String(Math.round(fromKg(set.weightKg, unitSystem) * 10) / 10),
  );
  const [reps, setReps] = useState(() =>
    set.reps === null ? "" : String(set.reps),
  );

  const isLogged = set.status !== "pending";

  const log = (status: "completed" | "skipped") => {
    const weightValue = weight.trim() === "" ? undefined : Number(weight);
    const repsValue = reps.trim() === "" ? undefined : Number(reps);

    onLog({
      status,
      // Displayed in the person's units; converted back to the single storage
      // unit (kilograms) at the boundary.
      ...(weightValue !== undefined && Number.isFinite(weightValue)
        ? { weightKg: Math.round(toKg(weightValue, unitSystem) * 100) / 100 }
        : {}),
      ...(repsValue !== undefined && Number.isFinite(repsValue)
        ? { reps: repsValue }
        : {}),
    });
  };

  return (
    <li className="flex flex-wrap items-center gap-2 py-2">
      <span className="caption w-14 shrink-0">
        {set.isWarmup ? "Warm-up" : `Set ${set.setIndex}`}
      </span>

      <label className="flex items-center gap-1">
        <span className="sr-only">Weight in {unitLabel(unitSystem)}</span>
        <input
          type="number"
          inputMode="decimal"
          step="0.5"
          min="0"
          value={weight}
          disabled={isLogged || busy}
          onChange={(event) => setWeight(event.target.value)}
          className="input h-9 w-20 px-2 tabular-nums"
        />
        <span className="caption">{unitLabel(unitSystem)}</span>
      </label>

      <label className="flex items-center gap-1">
        <span className="sr-only">Repetitions</span>
        <input
          type="number"
          inputMode="numeric"
          step="1"
          min="0"
          value={reps}
          disabled={isLogged || busy}
          onChange={(event) => setReps(event.target.value)}
          className="input h-9 w-16 px-2 tabular-nums"
        />
        <span className="caption">reps</span>
      </label>

      <div className="ml-auto flex items-center gap-2">
        {set.loggedBy === "agent" && (
          <span className="caption text-sky-text">by agent</span>
        )}

        {isLogged ? (
          <span
            className={
              set.status === "completed"
                ? "badge badge-brand"
                : "badge badge-neutral"
            }
          >
            {set.status === "completed" ? "Logged" : "Skipped"}
          </span>
        ) : (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => log("skipped")}
              className="btn btn-sm btn-ghost"
            >
              Skip
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => log("completed")}
              className="btn btn-sm btn-secondary"
            >
              Log
            </button>
          </>
        )}
      </div>
    </li>
  );
}
