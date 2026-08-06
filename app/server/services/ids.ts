/**
 * Identifiers are random UUIDs rather than sequential ids: workout ids appear in
 * URLs and in tool arguments, and non-guessable ids mean a leaked id is the only
 * way to reference someone else's row (and authorization still rejects it).
 */
export function newId(): string {
  return crypto.randomUUID();
}
