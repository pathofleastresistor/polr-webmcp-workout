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
      className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-lg border border-line bg-surface-raised p-0 text-ink shadow-lift backdrop:bg-black/40"
    >
      <div className="p-6">
        <p className="badge badge-sky mb-3">
          Your agent wants to run&nbsp;
          <code className="font-mono">{toolName}</code>
        </p>

        <h2 id="agent-confirm-title" className="title">
          {title}
        </h2>
        <p className="mt-2 text-ink-muted">{description}</p>

        {details && details.length > 0 && (
          <ul className="mt-4 max-h-56 space-y-1 overflow-y-auto rounded-sm bg-surface-sunken p-3 text-sm">
            {details.map((detail, index) => (
              <li key={index} className="flex gap-2">
                <span aria-hidden="true" className="text-ink-muted">
                  •
                </span>
                <span>{detail}</span>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={deny} className="btn btn-secondary">
            Not now
          </button>
          <button
            ref={confirmButtonRef}
            type="button"
            onClick={() => resolveConfirmation(id, true)}
            className={tone === "danger" ? "btn btn-danger" : "btn btn-primary"}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
