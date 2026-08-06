import { desc, eq } from "drizzle-orm";

import type { Database } from "~/db";
import { agentEvent, type Actor } from "~/db/schema";
import type { AgentEventView } from "~/domain/types";

import { newId } from "./ids";

/** Argument keys whose values are free text and are never worth persisting. */
const REDACTED_KEYS = new Set(["notes", "note", "reason", "rationale", "goal"]);

export interface RecordEventInput {
  userId: string;
  workoutId?: string | null;
  toolName: string;
  actor: Actor;
  args?: Record<string, unknown> | undefined;
  summary: string;
  outcome?: "ok" | "error" | "denied";
}

/**
 * Appends to the audit trail.
 *
 * This is what makes agent activity legible: the person can see every action
 * taken on their behalf, and an unexpected entry is the signal that something
 * went wrong. Free-text argument values are redacted — the trail records what
 * was done, not a second copy of the user's prose.
 */
export async function recordEvent(
  db: Database,
  input: RecordEventInput,
): Promise<void> {
  await db.insert(agentEvent).values({
    id: newId(),
    userId: input.userId,
    workoutId: input.workoutId ?? null,
    toolName: input.toolName,
    actor: input.actor,
    args: redact(input.args),
    summary: input.summary.slice(0, 500),
    outcome: input.outcome ?? "ok",
    createdAt: new Date(),
  });
}

export async function listRecentEvents(
  db: Database,
  userId: string,
  limit = 20,
): Promise<AgentEventView[]> {
  const rows = await db
    .select()
    .from(agentEvent)
    .where(eq(agentEvent.userId, userId))
    .orderBy(desc(agentEvent.createdAt))
    .limit(limit);

  return rows.map((row) => ({
    id: row.id,
    toolName: row.toolName,
    actor: row.actor,
    summary: row.summary,
    outcome: row.outcome,
    workoutId: row.workoutId,
    createdAt: row.createdAt.toISOString(),
  }));
}

function redact(
  args: Record<string, unknown> | undefined,
): Record<string, unknown> | null {
  if (!args) return null;

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    if (REDACTED_KEYS.has(key)) {
      result[key] = "[redacted]";
      continue;
    }
    // Nested structures (a full plan) are summarised by size, not stored whole.
    if (Array.isArray(value)) {
      result[key] = `[${value.length} item(s)]`;
      continue;
    }
    if (value !== null && typeof value === "object") {
      result[key] = "[object]";
      continue;
    }
    if (typeof value === "string" && value.length > 120) {
      result[key] = `${value.slice(0, 117)}...`;
      continue;
    }
    result[key] = value;
  }
  return result;
}
