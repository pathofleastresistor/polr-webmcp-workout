import { useState } from "react";
import { useFetcher } from "react-router";

import type { UnitSystem } from "~/db/schema";
import type { JsonObject } from "~/lib/json";
import type {
  SetView,
  WorkoutDetailView,
  WorkoutExerciseView,
} from "~/domain/types";
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
      action: `/api/workouts/${workout.id}${path}`,
      encType: "application/json",
    });

  return (
    <div className="mt-8">
      <div className="flex items-center gap-4">
        <div
          className="h-2 flex-1 overflow-hidden rounded-full bg-slate-800"
          role="progressbar"
          aria-valuenow={done}
          aria-valuemin={0}
          aria-valuemax={totalSets}
          aria-label="Sets completed"
        >
          <div
            className="h-full rounded-full bg-sky-500 transition-[width]"
            style={{ width: `${totalSets ? (done / totalSets) * 100 : 0}%` }}
          />
        </div>
        <span className="text-sm tabular-nums text-slate-400">
          {done}/{totalSets} sets
        </span>
        <span className="text-sm tabular-nums text-slate-400">
          {formatVolume(workout.totalVolumeKg, unitSystem)}
        </span>
      </div>

      {workout.notes && (
        <p className="mt-6 whitespace-pre-line rounded-xl border border-slate-800 bg-slate-900/40 p-4 text-sm text-slate-300">
          {workout.notes}
        </p>
      )}

      <ol className="mt-8 space-y-6">
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

      <div className="mt-10 flex flex-wrap gap-3 border-t border-slate-800 pt-6">
        <button
          type="button"
          disabled={busy}
          onClick={() => submit({ op: "finish", workoutId: workout.id })}
          className="rounded-xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-60"
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
          className="rounded-xl px-5 py-3 text-sm text-slate-400 transition hover:bg-slate-900 hover:text-slate-200 disabled:opacity-60"
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
    <li className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-medium">{entry.exercise.name}</h3>
          <p className="mt-0.5 text-xs uppercase tracking-wide text-slate-500">
            {entry.exercise.primaryMuscle} · {entry.exercise.equipment}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-500">
            {remaining === 0 ? "done" : `${remaining} left`}
          </span>
          <button
            type="button"
            onClick={onRemove}
            disabled={busy}
            className="rounded-lg px-2 py-1 text-xs text-slate-500 transition hover:bg-slate-800 hover:text-rose-300 disabled:opacity-60"
            aria-label={`Remove ${entry.exercise.name}`}
          >
            Remove
          </button>
        </div>
      </div>

      {entry.rationale && (
        <p className="mt-3 rounded-lg bg-sky-500/5 px-3 py-2 text-sm text-sky-200/80 ring-1 ring-sky-500/20">
          <span aria-hidden="true">✦</span> {entry.rationale}
        </p>
      )}

      <ul className="mt-4 space-y-2">
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
    <li className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-950/40 px-3 py-2">
      <span className="w-14 shrink-0 text-xs text-slate-500">
        {set.isWarmup ? "warm" : `Set ${set.setIndex}`}
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
          className="w-20 rounded-md border border-slate-800 bg-slate-900 px-2 py-1 text-sm tabular-nums disabled:opacity-60"
        />
        <span className="text-xs text-slate-500">{unitLabel(unitSystem)}</span>
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
          className="w-16 rounded-md border border-slate-800 bg-slate-900 px-2 py-1 text-sm tabular-nums disabled:opacity-60"
        />
        <span className="text-xs text-slate-500">reps</span>
      </label>

      <div className="ml-auto flex items-center gap-2">
        {set.loggedBy === "agent" && (
          <span
            className="text-xs text-sky-400"
            title="Logged by your agent"
            aria-label="Logged by your agent"
          >
            ✦
          </span>
        )}

        {isLogged ? (
          <span
            className={
              set.status === "completed"
                ? "rounded-md bg-emerald-500/10 px-2 py-1 text-xs text-emerald-300"
                : "rounded-md bg-slate-800 px-2 py-1 text-xs text-slate-400"
            }
          >
            {set.status === "completed" ? "logged" : "skipped"}
          </span>
        ) : (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => log("skipped")}
              className="rounded-md px-2 py-1 text-xs text-slate-500 transition hover:bg-slate-800 disabled:opacity-60"
            >
              Skip
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => log("completed")}
              className="rounded-md bg-sky-500 px-3 py-1 text-xs font-semibold text-slate-950 transition hover:bg-sky-400 disabled:opacity-60"
            >
              Log
            </button>
          </>
        )}
      </div>
    </li>
  );
}
