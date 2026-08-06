import type { Actor } from "~/db/schema";

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  /** Attribution only — the server never grants privilege from this. */
  actor?: Actor;
  signal?: AbortSignal;
}

/**
 * Calls this app's own resource routes.
 *
 * Both the UI and the WebMCP tools go through here, which is what makes a
 * button click and a tool call take the identical validated, authorized path
 * on the server. Requests are same-origin so the session cookie rides along
 * automatically; no token is ever handed to the agent.
 */
export async function apiFetch<TResult>(
  path: string,
  options: RequestOptions = {},
): Promise<TResult> {
  const { method = "GET", body, actor = "human", signal } = options;

  const headers: Record<string, string> = {
    Accept: "application/json",
    "X-Spotter-Actor": actor,
  };
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const response = await fetch(path, {
    method,
    headers,
    // Never send the session cookie anywhere but our own origin.
    credentials: "same-origin",
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    ...(signal ? { signal } : {}),
  });

  if (!response.ok) {
    throw await toApiError(response);
  }

  return (await response.json()) as TResult;
}

async function toApiError(response: Response): Promise<ApiError> {
  let code = "request_failed";
  let message = `Request failed with status ${response.status}.`;

  try {
    const payload = (await response.json()) as {
      error?: string;
      message?: string;
    };
    if (payload.error) code = payload.error;
    if (payload.message) message = payload.message;
  } catch {
    // Non-JSON error body (e.g. an HTML error page); keep the defaults.
  }

  return new ApiError(code, message, response.status);
}

export function buildQuery(params: Record<string, unknown>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}
