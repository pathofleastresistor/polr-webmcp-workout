import type { RouterContextProvider } from "react-router";
import type { z } from "zod";

import type { Database } from "~/db";
import type { Actor } from "~/db/schema";

import { getAppContext } from "./context";
import { enforceRateLimit, rateLimitKey } from "./rate-limit.server";
import { invalid } from "./services/errors";
import { toErrorResponse } from "./services/errors";
import { requireUser, type AuthenticatedUser } from "./access.server";

export interface ApiRequestContext<TInput> {
  input: TInput;
  user: AuthenticatedUser;
  db: Database;
  /** Whether the caller identified itself as the user's agent. */
  actor: Actor;
  request: Request;
  context: Readonly<RouterContextProvider>;
}

/**
 * Header a WebMCP tool sets so the server can record *who* drove an action.
 *
 * It is an attribution hint for the audit trail, never an authorization input:
 * the agent runs in the page under the person's own link and therefore has
 * exactly the person's privileges, no more. Treating this header as a permission
 * would be a privilege-escalation bug, so nothing branches on it except
 * logging.
 */
export const ACTOR_HEADER = "X-Spotter-Actor";

export function readActor(request: Request): Actor {
  return request.headers.get(ACTOR_HEADER) === "agent" ? "agent" : "human";
}

interface HandlerOptions<TSchema extends z.ZodType, TResult> {
  schema: TSchema;
  handle: (ctx: ApiRequestContext<z.infer<TSchema>>) => Promise<TResult>;
}

/**
 * Wraps a resource-route handler with the pipeline every endpoint needs:
 * authenticate, rate limit, parse input, run, and convert failures into JSON
 * an agent can act on.
 *
 * Both the UI and the WebMCP tools go through this, so there is exactly one
 * place where authorization and validation happen.
 */
export async function handleApiRequest<TSchema extends z.ZodType, TResult>(
  request: Request,
  context: Readonly<RouterContextProvider>,
  options: HandlerOptions<TSchema, TResult>,
): Promise<Response> {
  try {
    const { db } = getAppContext(context);
    const user = await requireUser(request, context);

    await enforceRateLimit("TOOL_RATE_LIMIT", rateLimitKey(request, user.id));

    const raw = await readInput(request);
    const parsed = options.schema.safeParse(raw);

    if (!parsed.success) {
      // Field-level detail so an agent can correct its call and retry rather
      // than guessing at what "bad request" meant.
      throw invalid(
        "invalid_input",
        parsed.error.issues
          .map(
            (issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`,
          )
          .join("; "),
      );
    }

    const result = await options.handle({
      input: parsed.data,
      user,
      db,
      actor: readActor(request),
      request,
      context,
    });

    return Response.json(result, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** GET reads take query params; mutations take a JSON body. */
async function readInput(request: Request): Promise<unknown> {
  if (request.method === "GET" || request.method === "HEAD") {
    const url = new URL(request.url);
    const entries: Record<string, unknown> = {};

    for (const [key, value] of url.searchParams.entries()) {
      // Query strings are all strings; coerce the shapes Zod cannot.
      if (value === "true" || value === "false") {
        entries[key] = value === "true";
      } else if (value !== "" && !Number.isNaN(Number(value))) {
        entries[key] = Number(value);
      } else {
        entries[key] = value;
      }
    }
    return entries;
  }

  const contentType = request.headers.get("Content-Type") ?? "";
  if (!contentType.includes("application/json")) {
    throw invalid(
      "unsupported_media_type",
      "Request body must be application/json.",
    );
  }

  try {
    return await request.json();
  } catch {
    throw invalid("malformed_json", "Request body is not valid JSON.");
  }
}
