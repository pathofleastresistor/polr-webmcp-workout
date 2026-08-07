import { useState } from "react";

import { LocalTime } from "~/components/LocalTime";
import { useWebMcp } from "~/webmcp/provider";

/**
 * The agent's presence, made visible.
 *
 * This app assumes an agent is acting for the person, which creates an
 * obligation the usual UI patterns do not cover: they should be able to see
 * what their agent can do here and what it has just done, without reading a
 * chat transcript in another window. The console is that surface — capability
 * list on one side, live activity on the other.
 */
export function AgentConsole() {
  const { availability, tools, activity } = useWebMcp();
  const [open, setOpen] = useState(false);

  const running = activity.some((entry) => entry.status === "running");

  return (
    <div className="fixed bottom-4 right-4 z-40 w-[min(24rem,calc(100vw-2rem))]">
      {open && (
        <div className="mb-2 max-h-[70vh] overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900/95 p-4 shadow-2xl backdrop-blur">
          <AvailabilityNotice availability={availability} />

          <section className="mt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Tools available here ({tools.length})
            </h3>
            <ul className="mt-2 space-y-1">
              {tools.map((tool) => (
                <li key={tool.name} className="flex items-start gap-2 text-sm">
                  <span
                    aria-hidden="true"
                    className={
                      tool.readOnly ? "text-slate-500" : "text-amber-400"
                    }
                    title={tool.readOnly ? "Reads data" : "Changes data"}
                  >
                    {tool.readOnly ? "◇" : "◆"}
                  </span>
                  <code className="font-mono text-xs text-slate-200">
                    {tool.name}
                  </code>
                </li>
              ))}
              {tools.length === 0 && (
                <li className="text-sm text-slate-500">
                  No tools registered on this page.
                </li>
              )}
            </ul>
            <p className="mt-2 text-xs text-slate-500">
              ◇ reads your data · ◆ changes it, and asks you first
            </p>
          </section>

          <section className="mt-4 border-t border-slate-800 pt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Recent agent activity
            </h3>
            {activity.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">
                Nothing yet. Ask your agent to suggest a workout.
              </p>
            ) : (
              <ol className="mt-2 space-y-2">
                {activity.slice(0, 12).map((entry) => (
                  <li key={entry.id} className="text-sm">
                    <div className="flex items-start gap-2">
                      <StatusDot status={entry.status} />
                      <div className="min-w-0">
                        <p className="text-slate-200">{entry.summary}</p>
                        <p className="font-mono text-[11px] text-slate-500">
                          {entry.toolName} ·{" "}
                          <LocalTime value={entry.at} style="clock" />
                        </p>
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 rounded-full border border-slate-700 bg-slate-900/95 px-4 py-3 text-sm font-medium text-slate-100 shadow-xl backdrop-blur transition hover:border-slate-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400"
      >
        <span className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className={
              running
                ? "size-2 animate-pulse rounded-full bg-sky-400"
                : availability === "available"
                  ? "size-2 rounded-full bg-emerald-400"
                  : "size-2 rounded-full bg-slate-600"
            }
          />
          {running ? "Agent working…" : "Agent console"}
        </span>
        <span className="text-xs text-slate-400">
          {tools.length} tool{tools.length === 1 ? "" : "s"}
          {open ? " ▾" : " ▴"}
        </span>
      </button>
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  const styles: Record<string, string> = {
    running: "bg-sky-400 animate-pulse",
    ok: "bg-emerald-400",
    error: "bg-rose-400",
    denied: "bg-slate-500",
  };
  return (
    <span
      aria-hidden="true"
      className={`mt-1.5 size-2 shrink-0 rounded-full ${styles[status] ?? "bg-slate-500"}`}
    />
  );
}

function AvailabilityNotice({ availability }: { availability: string }) {
  if (availability === "available") {
    return (
      <p className="rounded-lg bg-emerald-500/10 p-3 text-sm text-emerald-200 ring-1 ring-emerald-500/30">
        Your browser supports WebMCP. Your agent can see and use the tools on
        this page.
      </p>
    );
  }

  if (availability === "pending") {
    return (
      <p className="rounded-lg bg-slate-800 p-3 text-sm text-slate-300">
        Checking for agent support…
      </p>
    );
  }

  return (
    <div className="rounded-lg bg-amber-500/10 p-3 text-sm text-amber-100 ring-1 ring-amber-500/30">
      <p className="font-medium">No WebMCP support detected.</p>
      <p className="mt-1 text-amber-200/80">
        Everything here works by hand, but your agent will not be able to see
        this page&apos;s tools. WebMCP ships in Chrome 146+ and Edge 147+; on
        older browsers an agent extension that polyfills{" "}
        <code className="font-mono text-xs">document.modelContext</code> also
        works.
      </p>
    </div>
  );
}
