import { useState } from "react";

/**
 * Shows the person their link with a copy button.
 *
 * The link is the whole account, so this is the one thing on the page worth a
 * warm callout: lose it and the workouts are gone; share it and so are they.
 */
export function PrivateLink({
  url,
  title,
  children,
}: {
  url: string;
  title: string;
  children: React.ReactNode;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard denied (permissions, insecure context). The URL is on screen
      // and selectable, so there is nothing more to do.
    }
  };

  return (
    <section className="rounded-lg bg-marigold-soft p-6">
      <h2 className="title">{title}</h2>
      <p className="mt-1 text-ink">{children}</p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <code className="min-w-0 flex-1 truncate rounded-sm bg-surface-raised px-3 py-2 font-mono text-sm select-all">
          {url}
        </code>
        <button
          type="button"
          onClick={copy}
          className="btn btn-sm btn-secondary"
        >
          {copied ? "Copied" : "Copy link"}
        </button>
      </div>
    </section>
  );
}
