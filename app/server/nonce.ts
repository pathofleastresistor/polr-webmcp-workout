import { createContext } from "react-router";

/**
 * Per-response CSP nonce. Set by the Worker entry before the request handler
 * runs so that both the middleware (which writes the CSP header) and the root
 * route (which stamps `nonce` onto `<Scripts>`) read the same value.
 */
export const nonceContext = createContext<string>();
