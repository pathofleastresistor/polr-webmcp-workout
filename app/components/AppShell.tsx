import { Link, NavLink } from "react-router";

import { useLinkPath } from "~/lib/link";

import { AgentConsole } from "./AgentConsole";

/** Chrome for pages under a link: name, settings, and the agent console. */
export function AppShell({ children }: { children: React.ReactNode }) {
  const linkPath = useLinkPath();

  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-4 py-6 sm:px-8">
        <Link
          to={linkPath()}
          className="rounded-sm font-display text-2xl font-bold tracking-[-0.01em]"
        >
          Spotter
        </Link>

        <NavLink
          to={linkPath("/settings")}
          className={({ isActive }) =>
            `btn btn-sm ${isActive ? "btn-secondary" : "btn-ghost"}`
          }
        >
          Settings
        </NavLink>
      </header>

      <main className="mx-auto max-w-4xl px-4 pt-4 pb-32 sm:px-8">
        {children}
      </main>

      <AgentConsole />
    </div>
  );
}
