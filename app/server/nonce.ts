import { createContext } from "react-router";

/**
 * Per-response CSP nonce. Set by the request-context middleware before the
 * rest of the chain, so both the security middleware (which writes the CSP
 * header) and the root route (which stamps it onto `<Scripts>`) agree.
 *
 * The empty default is load-bearing. A URL that matches no route never runs
 * the middleware chain, and without a default `context.get` throws there —
 * inside `entry.server`, while rendering the 404 through the error boundary.
 * That turned every unknown path into a plain-text "Unexpected Server Error"
 * instead of the styled page. No middleware also means no CSP header on that
 * response, so there is no nonce for the scripts to carry and nothing is
 * loosened by falling back to none.
 */
export const nonceContext = createContext<string>("");
