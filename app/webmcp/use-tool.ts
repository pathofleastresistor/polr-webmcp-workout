import { useEffect, useRef } from "react";
import type { z } from "zod";

import { toolInputSchema } from "~/domain/contracts";

import { useWebMcp } from "./provider";
import { getModelContext, toolError, toolOk } from "./runtime";
import type {
  CallToolResult,
  ModelContextClient,
  ToolAnnotations,
} from "./types";

export interface WebMcpToolDefinition<TSchema extends z.ZodType> {
  name: string;
  title: string;
  description: string;
  schema: TSchema;
  annotations?: ToolAnnotations;
  /**
   * Short line for the in-page activity feed, written before the tool runs so
   * the person sees what is happening while it happens.
   */
  activityLabel?: (args: z.infer<TSchema>) => string;
  execute: (
    args: z.infer<TSchema>,
    client: ModelContextClient,
  ) => Promise<CallToolResult>;
}

/**
 * Registers one WebMCP tool for as long as the calling component is mounted.
 *
 * Two things make this safe to use from ordinary components:
 *
 *  - The descriptor handed to the browser is built once. `execute` reads the
 *    latest definition through a ref, so a tool that closes over changing state
 *    stays correct without churning the agent's tool list on every render.
 *  - Registration is torn down with an `AbortSignal`, which is the replacement
 *    for the `unregisterTool` method removed from the spec in April 2026.
 *
 * Arguments are re-validated here even though the browser checks them against
 * `inputSchema`: the runtime's enforcement is a convenience, not a guarantee,
 * and the server validates a third time regardless.
 */
export function useWebMcpTool<TSchema extends z.ZodType>(
  definition: WebMcpToolDefinition<TSchema>,
  { enabled = true }: { enabled?: boolean } = {},
): void {
  const { registerTool, beginActivity, endActivity } = useWebMcp();

  const definitionRef = useRef(definition);

  // Refreshed after every render rather than during it, so `execute` always
  // sees current state without the descriptor itself having to change.
  useEffect(() => {
    definitionRef.current = definition;
  });

  const { name, title, description, annotations } = definition;
  const readOnly = annotations?.readOnlyHint === true;

  useEffect(() => {
    if (!enabled) return;

    const modelContext = getModelContext();
    if (!modelContext) return;

    const controller = new AbortController();

    const execute = async (
      rawArgs: unknown,
      client: ModelContextClient,
    ): Promise<CallToolResult> => {
      const current = definitionRef.current;

      const parsed = current.schema.safeParse(rawArgs ?? {});
      if (!parsed.success) {
        return toolError(
          `Invalid arguments for ${current.name}: ${parsed.error.issues
            .map(
              (issue) =>
                `${issue.path.join(".") || "(root)"}: ${issue.message}`,
            )
            .join("; ")}`,
          "invalid_input",
        );
      }

      const label =
        current.activityLabel?.(parsed.data) ?? current.title ?? current.name;
      const activityId = beginActivity(current.name, label);

      try {
        const result = await current.execute(parsed.data, client);
        endActivity(
          activityId,
          result.isError ? "error" : "ok",
          firstText(result) ?? label,
        );
        return result;
      } catch (error) {
        // A tool must never reject: an exception reaches the agent as an opaque
        // failure, while an error *result* carries a message it can act on.
        const message =
          error instanceof Error
            ? error.message
            : "The action failed unexpectedly.";
        endActivity(activityId, "error", message);
        return toolError(message, "tool_failed");
      }
    };

    void modelContext
      .registerTool(
        {
          name,
          title,
          description,
          inputSchema: toolInputSchema(definitionRef.current.schema),
          annotations: definitionRef.current.annotations,
          execute: execute as never,
        },
        { signal: controller.signal },
      )
      .catch((error: unknown) => {
        // Unmounting aborts the signal on purpose, and the pending
        // registration rejects with an AbortError as a result. That is this
        // hook's own teardown completing, not a failure worth reporting.
        if (controller.signal.aborted) return;
        console.error(`Failed to register WebMCP tool "${name}"`, error);
      });

    const unregisterFromUi = registerTool({ name, description, readOnly });

    return () => {
      controller.abort();
      unregisterFromUi();
    };
    // The descriptor is intentionally registered once per tool identity; live
    // values are read through `definitionRef` inside `execute`.
    //
    // `annotations` is deliberately absent: every call site passes an object
    // literal, so it is a fresh identity on every render. Including it made
    // this effect tear down and re-register on *each* render — aborting the
    // in-flight registration each time (logging an AbortError per tool per
    // render) and leaving an agent's tool list continuously churning. The
    // descriptor reads it through `definitionRef` instead, which is also how
    // the rest of the definition is kept current.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, title, description, readOnly, enabled]);
}

function firstText(result: CallToolResult): string | null {
  for (const block of result.content) {
    if (block.type === "text" && typeof block.text === "string") {
      return block.text;
    }
  }
  return null;
}

export { toolError, toolOk };
