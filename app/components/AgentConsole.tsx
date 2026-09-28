import { useState } from "react";

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
        <div className="mb-2 max-h-[70vh] overflow-y-auto rounded-lg border border-line bg-surface-raised p-6 shadow-lift">
          <AvailabilityNotice availability={availability} />

          <section className="mt-6">
            <h3 className="label">Tools on this page ({tools.length})</h3>
            <ul className="mt-2 space-y-1">
              {tools.map((tool) => (
                <li key={tool.name} className="flex items-start gap-2 text-sm">
                  <span
                    aria-hidden="true"
                    className={
                      tool.readOnly ? "text-ink-muted" : "text-marigold-text"
                    }
                    title={tool.readOnly ? "Reads data" : "Changes data"}
                  >
                    {tool.readOnly ? "◇" : "◆"}
                  </span>
                  <code className="font-mono text-xs">{tool.name}</code>
                </li>
              ))}
              {tools.length === 0 && (
                <li className="caption">No tools on this page.</li>
              )}
            </ul>
            <p className="caption mt-2">
              ◇ reads your data · ◆ changes it, and asks you first
            </p>
          </section>

          <section className="mt-6 border-t border-line pt-6">
            <h3 className="label">Recent agent activity</h3>
            {activity.length === 0 ? (
              <p className="caption mt-2">Nothing yet.</p>
            ) : (
              <ol className="mt-2 space-y-2">
                {activity.slice(0, 12).map((entry) => (
                  <li key={entry.id} className="text-sm">
                    <div className="flex items-start gap-2">
                      <StatusDot status={entry.status} />
                      <div className="min-w-0">
                        <p>{entry.summary}</p>
                        <p className="caption font-mono">
                          {entry.toolName} ·{" "}
                          {new Date(entry.at).toLocaleTimeString()}
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
        className="btn btn-secondary w-full justify-between shadow-card"
      >
        <span className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className={
              running
                ? "size-2 animate-pulse rounded-full bg-sky"
                : availability === "available"
                  ? "size-2 rounded-full bg-brand"
                  : "size-2 rounded-full bg-line-strong"
            }
          />
          {running ? "Agent working…" : "Agent"}
        </span>
        <span className="caption">
          {tools.length} tool{tools.length === 1 ? "" : "s"}
          {open ? " ▾" : " ▴"}
        </span>
      </button>
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  const styles: Record<string, string> = {
    running: "bg-sky animate-pulse",
    ok: "bg-brand",
    error: "bg-danger",
    denied: "bg-line-strong",
  };
  return (
    <span
      aria-hidden="true"
      className={`mt-1.5 size-2 shrink-0 rounded-full ${styles[status] ?? "bg-line-strong"}`}
    />
  );
}

function AvailabilityNotice({ availability }: { availability: string }) {
  if (availability === "available") {
    return (
      <p className="rounded-sm bg-brand-soft p-3 text-sm">
        Your browser supports WebMCP. Your agent can use the tools on this page.
      </p>
    );
  }

  if (availability === "pending") {
    return (
      <p className="rounded-sm bg-surface-sunken p-3 text-sm">
        Checking for agent support…
      </p>
    );
  }

  return (
    <div className="rounded-sm bg-marigold-soft p-3 text-sm">
      <p className="font-semibold">No WebMCP support detected</p>
      <p className="mt-1">
        Everything here works by hand, but your agent will not be able to see
        this page&apos;s tools. WebMCP ships in Chrome 146+ and Edge 147+; on
        older browsers an agent extension that polyfills{" "}
        <code className="font-mono text-xs">document.modelContext</code> also
        works.
      </p>
    </div>
  );
}
