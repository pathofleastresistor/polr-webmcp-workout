import { createContext } from "react-router";

/**
 * Per-response CSP nonce, set by the request-context middleware so both the
 * security middleware (which writes the CSP header) and the root route (which
 * stamps it onto `<Scripts>`) agree on one value.
 *
 * The default is deliberate. Route middleware does not run when no route
 * matches, so on a 404 nothing sets this — and reading an unset context throws,
 * which turned every unmatched URL into a 500 rather than a 404 page. Callers
 * treat the empty string as "not set" and generate their own.
 */
export const nonceContext = createContext<string>("");

/**
 * Lives here rather than beside the CSP so the server entry can reach it
 * without pulling in the whole security module.
 */
export function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}
