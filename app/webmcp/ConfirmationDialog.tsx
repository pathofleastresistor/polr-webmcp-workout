import { useEffect, useRef } from "react";

import { useWebMcp } from "./provider";

/**
 * The human half of the handshake.
 *
 * Anything an agent does that the person would not want done silently — writing
 * a plan, ending a session, discarding work — pauses here. The dialog is modal
 * and traps focus, and dismissing it counts as "no", so a person who ignores it
 * has denied the action rather than accidentally allowed it.
 */
export function ConfirmationDialog() {
  const { pendingConfirmation, resolveConfirmation } = useWebMcp();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (pendingConfirmation && !dialog.open) {
      dialog.showModal();
      // Focus the confirm button so keyboard and screen-reader users land on
      // the decision rather than having to hunt for it.
      confirmButtonRef.current?.focus();
    } else if (!pendingConfirmation && dialog.open) {
      dialog.close();
    }
  }, [pendingConfirmation]);

  if (!pendingConfirmation) return null;

  const { id, title, description, details, confirmLabel, tone, toolName } =
    pendingConfirmation;

  const deny = () => resolveConfirmation(id, false);

  return (
    <dialog
      ref={dialogRef}
      // Esc, backdrop dismissal and any other close path all mean "no".
      onCancel={(event) => {
        event.preventDefault();
        deny();
      }}
      onClose={deny}
      aria-labelledby="agent-confirm-title"
      className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-2xl border border-slate-700 bg-slate-900 p-0 text-slate-100 backdrop:bg-slate-950/70 backdrop:backdrop-blur-sm"
    >
      <div className="p-6">
        <p className="mb-2 inline-flex items-center gap-2 rounded-full bg-sky-500/10 px-3 py-1 text-xs font-medium text-sky-300 ring-1 ring-sky-500/30">
          <span aria-hidden="true">✦</span>
          Your agent wants to run <code className="font-mono">{toolName}</code>
        </p>

        <h2 id="agent-confirm-title" className="text-xl font-semibold">
          {title}
        </h2>
        <p className="mt-2 text-sm text-slate-300">{description}</p>

        {details && details.length > 0 && (
          <ul className="mt-4 max-h-56 space-y-1 overflow-y-auto rounded-lg bg-slate-950/60 p-3 text-sm text-slate-200">
            {details.map((detail, index) => (
              <li key={index} className="flex gap-2">
                <span aria-hidden="true" className="text-slate-500">
                  •
                </span>
                <span>{detail}</span>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={deny}
            className="rounded-lg px-4 py-2 text-sm font-medium text-slate-300 transition hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400"
          >
            Not now
          </button>
          <button
            ref={confirmButtonRef}
            type="button"
            onClick={() => resolveConfirmation(id, true)}
            className={
              tone === "danger"
                ? "rounded-lg bg-rose-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-300"
                : "rounded-lg bg-sky-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-sky-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300"
            }
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
