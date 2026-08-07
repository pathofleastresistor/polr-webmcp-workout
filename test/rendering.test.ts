import { RouterContextProvider } from "react-router";
import { describe, expect, it } from "vitest";

import { formatVolume } from "~/lib/units";
import { nonceContext } from "~/server/nonce";

/**
 * Both cases here are the same shape of bug: something that renders twice —
 * once on the server, once in the browser — reading a value the two runtimes
 * disagree about.
 */

describe("nonceContext", () => {
  it("resolves without middleware having run", () => {
    // A URL matching no route skips the middleware chain entirely, so nothing
    // ever calls `context.set`. Without a default this threw inside
    // `entry.server` while rendering the 404, and the styled error page was
    // replaced by a plain-text "Unexpected Server Error".
    const context = new RouterContextProvider();

    expect(() => context.get(nonceContext)).not.toThrow();
    expect(context.get(nonceContext)).toBe("");
  });

  it("still carries a nonce the middleware set", () => {
    const context = new RouterContextProvider();
    context.set(nonceContext, "abc123");

    expect(context.get(nonceContext)).toBe("abc123");
  });
});

describe("formatVolume", () => {
  it("groups thousands under a pinned locale, not the runtime's default", () => {
    // `toLocaleString()` with no argument reads whatever default the host was
    // started with — "3.220" under a German default against "3,220" under an
    // American one. The server and the browser are two different hosts, so any
    // difference is a hydration mismatch and React discards the subtree.
    //
    // Asserting the exact string is what pins this: the separator can only
    // stay stable across both renders while the locale is passed explicitly.
    expect(formatVolume(3220, "metric")).toBe("3,220 kg");
    expect(formatVolume(1000000, "metric")).toBe("1,000,000 kg");
    expect(formatVolume(999, "metric")).toBe("999 kg");
  });
});
