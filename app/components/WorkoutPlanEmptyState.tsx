import { useFetcher } from "react-router";

import type { WorkoutDetailView } from "~/domain/types";
import { useLinkPath } from "~/lib/link";

/**
 * A fresh session with nothing in it yet. The next move is to ask the agent
 * for a plan; discarding is the way out.
 */
export function WorkoutPlanEmptyState({
  workout,
}: {
  workout: WorkoutDetailView;
}) {
  const fetcher = useFetcher();
  const linkPath = useLinkPath();
  const isCancelling = fetcher.state !== "idle";

  return (
    <div className="mt-8 rounded-lg bg-surface-sunken p-6">
      <h2 className="title">Nothing planned yet</h2>
      <p className="mt-1 text-ink-muted">
        Ask your agent to plan this workout, for example &ldquo;program 45
        minutes around what I&apos;ve been neglecting&rdquo;. You approve the
        plan before it&apos;s saved.
      </p>

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
              action: linkPath(`/api/workouts/${workout.id}`),
              encType: "application/json",
            },
          )
        }
        className="btn btn-sm btn-secondary mt-6"
      >
        {isCancelling ? "Discarding…" : "Discard workout"}
      </button>
    </div>
  );
}
