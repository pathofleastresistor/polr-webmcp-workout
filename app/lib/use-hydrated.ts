import { useSyncExternalStore } from "react";

/** Nothing to subscribe to: the value changes exactly once, at hydration. */
const subscribe = () => () => {};
const getSnapshot = () => true;
const getServerSnapshot = () => false;

/**
 * False while rendering on the server and during the hydrating render, true
 * from the first client render after that.
 *
 * Anything whose value comes from the browser rather than from data — its
 * timezone, its locale, the current clock — has to wait for this. The server
 * renders in whatever zone the container happens to run in, the browser renders
 * in the visitor's, and React treats a text difference between the two as a
 * failed hydration: it discards the server's markup for that subtree and logs
 * error #418.
 *
 * `useSyncExternalStore` is what makes the transition legal rather than a
 * mismatch of its own. React reads `getServerSnapshot` both when rendering on
 * the server and while hydrating, so the first client render is identical to
 * the markup it is hydrating; only afterwards does it switch to `getSnapshot`
 * and re-render.
 *
 * The cost is that a timezone-dependent value paints once in the server's zone
 * and then corrects itself. That is deliberate — the alternative is a blank
 * where the time should be, and a brief absolute value is easier to read past
 * than a gap that moves the layout when it fills.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
