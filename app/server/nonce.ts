import { createContext } from "react-router";

/**
 * Per-response CSP nonce. Set by the request-context middleware before the
 * rest of the chain, so both the security middleware (which writes the CSP
 * header) and the root route (which stamps it onto `<Scripts>`) agree.
 */
export const nonceContext = createContext<string>();
