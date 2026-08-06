/**
 * Domain errors carry an agent-readable code plus a message written for an LLM:
 * it says what went wrong *and* what to do next, because the caller is usually
 * an agent deciding its next tool call rather than a person reading a toast.
 */
export class DomainError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "DomainError";
  }
}

export const notFound = (what: string) =>
  new DomainError(
    "not_found",
    `${what} was not found, or does not belong to the signed-in user.`,
    404,
  );

export const conflict = (code: string, message: string) =>
  new DomainError(code, message, 409);

export const invalid = (code: string, message: string) =>
  new DomainError(code, message, 400);

/** Converts any thrown value into a JSON `Response` for a resource route. */
export function toErrorResponse(error: unknown): Response {
  if (error instanceof Response) return error;

  if (error instanceof DomainError) {
    return Response.json(
      { error: error.code, message: error.message },
      { status: error.status },
    );
  }

  console.error("Unhandled service error", error);
  return Response.json(
    {
      error: "internal_error",
      message:
        "Something went wrong on the server. The action was not applied.",
    },
    { status: 500 },
  );
}
