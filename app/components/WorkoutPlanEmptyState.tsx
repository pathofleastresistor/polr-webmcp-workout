import { useFetcher } from "react-router";

import type { WorkoutDetailView } from "~/domain/types";

const PROMPT_SUGGESTIONS = [
  "Look at what I've been neglecting and program 45 minutes around it.",
  "Same as my last upper body session, but add 2.5 kg to the main lifts.",
  "I've got 30 minutes and only dumbbells. Give me something for legs.",
  "Build me a push day and keep total volume near last week's.",
];

/**
 * The placeholder state of a fresh session.
 *
 * A blank workout is the moment this product is most unlike a normal tracker:
 * the expected next move is to *ask*, not to tap. So the empty state teaches
 * the handoff — it shows what to say, and offers a manual path for anyone who
 * would rather build the session themselves.
 */
export function WorkoutPlanEmptyState({
  workout,
}: {
  workout: WorkoutDetailView;
}) {
  const fetcher = useFetcher();
  const isCancelling = fetcher.state !== "idle";

  return (
    <div className="mt-10">
      <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/30 p-8 text-center">
        <span
          aria-hidden="true"
          className="inline-grid size-12 place-items-center rounded-full bg-sky-500/10 text-xl text-sky-300 ring-1 ring-sky-500/30"
        >
          ✦
        </span>
        <h2 className="mt-4 text-xl font-semibold">
          This session is empty. Ask your agent to fill it in.
        </h2>
        <p className="mx-auto mt-2 max-w-lg text-slate-400 text-pretty">
          Your agent can read your training history and put a full plan here for
          you to approve. Nothing gets saved until you accept it.
        </p>

        <ul className="mx-auto mt-6 grid max-w-2xl gap-2 text-left">
          {PROMPT_SUGGESTIONS.map((prompt) => (
            <li
              key={prompt}
              className="rounded-lg border border-slate-800 bg-slate-950/50 px-4 py-3 text-sm text-slate-300"
            >
              <span aria-hidden="true" className="mr-2 text-slate-600">
                &ldquo;
              </span>
              {prompt}
            </li>
          ))}
        </ul>

        <p className="mt-6 text-xs text-slate-500">
          Your agent will call{" "}
          <code className="font-mono">get_training_insights</code>, then{" "}
          <code className="font-mono">propose_workout_plan</code> — and you
          decide.
        </p>
      </div>

      <div className="mt-6 flex justify-center">
        <button
          type="button"
          disabled={isCancelling}
          onClick={() =>
            // Submitted as JSON rather than form fields so the body matches the
            // exact shape the resource route's Zod schema expects.
            fetcher.submit(
              { op: "cancel", workoutId: workout.id },
              {
                method: "post",
                action: `/api/workouts/${workout.id}`,
                encType: "application/json",
              },
            )
          }
          className="rounded-lg px-4 py-2 text-sm text-slate-400 transition hover:bg-slate-900 hover:text-slate-200 disabled:opacity-60"
        >
          {isCancelling ? "Discarding…" : "Discard this session"}
        </button>
      </div>
    </div>
  );
}
