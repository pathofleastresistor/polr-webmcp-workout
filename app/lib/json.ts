/**
 * JSON-safe value types.
 *
 * React Router's `submit()` only accepts serialisable data when submitting with
 * `encType: "application/json"`, and typing request bodies this way catches a
 * `Date` or `undefined` slipping into a payload at compile time rather than
 * producing a silently mangled request.
 */
export type JsonPrimitive = string | number | boolean | null;

export type JsonValue =
  JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type JsonObject = { [key: string]: JsonValue };
