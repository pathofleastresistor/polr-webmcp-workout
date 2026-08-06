import { Form, Link, NavLink } from "react-router";

import { AgentConsole } from "./AgentConsole";

interface AppShellProps {
  user: { name: string; image: string | null };
  /** Renders the demo banner. See app/server/env.server.ts. */
  demoMode?: boolean;
  children: React.ReactNode;
}

/** Signed-in chrome: navigation, account, and the always-present agent console. */
export function AppShell({ user, demoMode = false, children }: AppShellProps) {
  return (
    <div className="min-h-screen bg-slate-950">
      {demoMode && (
        <p className="bg-amber-500/15 px-4 py-2 text-center text-sm text-amber-100">
          <strong className="font-semibold">Demo mode.</strong> This is a
          throwaway account seeded with sample training. Anyone can sign in
          without credentials — don&apos;t put real data here.
        </p>
      )}
      <header className="border-b border-slate-800/80 bg-slate-950/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-4">
          <Link to="/dashboard" className="flex items-center gap-2">
            <Logo />
            <span className="text-lg font-semibold tracking-tight">
              Spotter
            </span>
          </Link>

          <nav className="flex items-center gap-1" aria-label="Main">
            <NavItem to="/dashboard">Dashboard</NavItem>
            <NavItem to="/settings">Settings</NavItem>
          </nav>

          <div className="flex items-center gap-3">
            {user.image ? (
              <img
                src={user.image}
                alt=""
                width={32}
                height={32}
                className="size-8 rounded-full ring-1 ring-slate-700"
                referrerPolicy="no-referrer"
              />
            ) : (
              <span
                aria-hidden="true"
                className="grid size-8 place-items-center rounded-full bg-slate-800 text-sm font-medium"
              >
                {user.name.charAt(0).toUpperCase()}
              </span>
            )}
            {/* POST so sign-out cannot be triggered by a stray link or prefetch. */}
            <Form method="post" action="/settings">
              <input type="hidden" name="intent" value="sign-out" />
              <button
                type="submit"
                className="rounded-lg px-3 py-1.5 text-sm text-slate-300 transition hover:bg-slate-800 hover:text-slate-100"
              >
                Sign out
              </button>
            </Form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10 pb-32">{children}</main>

      <AgentConsole />
    </div>
  );
}

function NavItem({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `rounded-lg px-3 py-1.5 text-sm transition ${
          isActive
            ? "bg-slate-800 text-slate-100"
            : "text-slate-400 hover:bg-slate-900 hover:text-slate-200"
        }`
      }
    >
      {children}
    </NavLink>
  );
}

export function Logo({ className = "size-7" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={`${className} text-sky-400`}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <path d="M4 9v6M20 9v6M7 7v10M17 7v10M7 12h10" />
    </svg>
  );
}
