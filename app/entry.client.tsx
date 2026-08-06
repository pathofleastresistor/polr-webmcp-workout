import { startTransition, StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";
import { HydratedRouter } from "react-router/dom";

/**
 * Explicit client entry.
 *
 * Equivalent to React Router's default, but declared in the app so hydration
 * does not depend on resolving a module inside `node_modules` at runtime, and
 * so `StrictMode` is on — it double-invokes effects in development, which is
 * exactly how a tool that registers on mount and unregisters on cleanup gets
 * caught misbehaving.
 */
startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <HydratedRouter />
    </StrictMode>,
  );
});
