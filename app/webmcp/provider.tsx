import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import { detectAvailability, type WebMcpAvailability } from "./runtime";
import type { ModelContextClient } from "./types";

export interface ActivityEntry {
  id: string;
  toolName: string;
  summary: string;
  status: "running" | "ok" | "error" | "denied";
  at: number;
}

export interface ConfirmationRequest {
  id: string;
  toolName: string;
  title: string;
  description: string;
  /** Rendered as a review list so the person sees exactly what will happen. */
  details?: string[];
  confirmLabel: string;
  tone: "neutral" | "danger";
  resolve: (approved: boolean) => void;
}

export interface RegisteredTool {
  name: string;
  description: string;
  readOnly: boolean;
}

interface WebMcpContextValue {
  availability: WebMcpAvailability;
  tools: RegisteredTool[];
  activity: ActivityEntry[];
  pendingConfirmation: ConfirmationRequest | null;
  registerTool: (tool: RegisteredTool) => () => void;
  beginActivity: (toolName: string, summary: string) => string;
  endActivity: (
    id: string,
    status: ActivityEntry["status"],
    summary?: string,
  ) => void;
  requestConfirmation: (
    request: Omit<ConfirmationRequest, "id" | "resolve">,
    client?: ModelContextClient,
  ) => Promise<boolean>;
  resolveConfirmation: (id: string, approved: boolean) => void;
}

const WebMcpContext = createContext<WebMcpContextValue | null>(null);

const MAX_ACTIVITY_ENTRIES = 50;

/**
 * Holds everything the page needs to behave as an agent surface: which tools
 * are currently registered, what the agent has been doing, and the confirmation
 * handshake for consequential actions.
 *
 * Deliberately a plain React context rather than an external store — the state
 * is small, per-tab, and never needs to outlive the page.
 */
/** The tool list is fixed once the document exists, so nothing to subscribe to. */
const noopSubscribe = () => () => {};

export function WebMcpProvider({ children }: { children: ReactNode }) {
  // `document.modelContext` does not exist during SSR, so this is read through
  // `useSyncExternalStore`: the server snapshot is "pending" and the client
  // snapshot is the real answer, which keeps hydration consistent without a
  // state-setting effect.
  const availability = useSyncExternalStore<WebMcpAvailability>(
    noopSubscribe,
    detectAvailability,
    () => "pending",
  );

  const [tools, setTools] = useState<RegisteredTool[]>([]);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [pendingConfirmation, setPendingConfirmation] =
    useState<ConfirmationRequest | null>(null);

  const registerTool = useCallback((tool: RegisteredTool) => {
    setTools((current) =>
      current.some((entry) => entry.name === tool.name)
        ? current
        : [...current, tool],
    );
    return () => {
      setTools((current) =>
        current.filter((entry) => entry.name !== tool.name),
      );
    };
  }, []);

  const beginActivity = useCallback((toolName: string, summary: string) => {
    const id = crypto.randomUUID();
    setActivity((current) =>
      [
        { id, toolName, summary, status: "running" as const, at: Date.now() },
        ...current,
      ].slice(0, MAX_ACTIVITY_ENTRIES),
    );
    return id;
  }, []);

  const endActivity = useCallback(
    (id: string, status: ActivityEntry["status"], summary?: string) => {
      setActivity((current) =>
        current.map((entry) =>
          entry.id === id
            ? { ...entry, status, summary: summary ?? entry.summary }
            : entry,
        ),
      );
    },
    [],
  );

  // The live request is mirrored into a ref, written only from callbacks, so
  // `resolveConfirmation` can settle the promise and the unmount cleanup can
  // deny it without either closing over a stale render's value.
  const pendingRef = useRef<ConfirmationRequest | null>(null);

  const requestConfirmation = useCallback(
    (
      request: Omit<ConfirmationRequest, "id" | "resolve">,
      client?: ModelContextClient,
    ): Promise<boolean> => {
      const show = () =>
        new Promise<boolean>((resolve) => {
          const entry: ConfirmationRequest = {
            ...request,
            id: crypto.randomUUID(),
            resolve,
          };
          pendingRef.current = entry;
          setPendingConfirmation(entry);
        });

      // `requestUserInteraction` asks the browser to surface this tab and grant
      // transient activation before we prompt. Without it the dialog can open
      // in a background tab the person never sees, and "no response" would read
      // as consent. When the runtime does not provide it we still prompt — the
      // person just may not be looking at the tab.
      if (typeof client?.requestUserInteraction === "function") {
        return client.requestUserInteraction(show);
      }
      return show();
    },
    [],
  );

  const resolveConfirmation = useCallback((id: string, approved: boolean) => {
    const current = pendingRef.current;
    // Ignore a stale resolution for a dialog that already closed, so a
    // double-click cannot settle the next request too.
    if (!current || current.id !== id) return;
    pendingRef.current = null;
    current.resolve(approved);
    setPendingConfirmation(null);
  }, []);

  // A pending confirmation left unresolved would hang the agent's tool call
  // forever; unmounting denies it instead.
  useEffect(() => {
    return () => {
      pendingRef.current?.resolve(false);
    };
  }, []);

  const value = useMemo<WebMcpContextValue>(
    () => ({
      availability,
      tools,
      activity,
      pendingConfirmation,
      registerTool,
      beginActivity,
      endActivity,
      requestConfirmation,
      resolveConfirmation,
    }),
    [
      availability,
      tools,
      activity,
      pendingConfirmation,
      registerTool,
      beginActivity,
      endActivity,
      requestConfirmation,
      resolveConfirmation,
    ],
  );

  return (
    <WebMcpContext.Provider value={value}>{children}</WebMcpContext.Provider>
  );
}

export function useWebMcp(): WebMcpContextValue {
  const value = useContext(WebMcpContext);
  if (!value) {
    throw new Error("useWebMcp must be used inside <WebMcpProvider>");
  }
  return value;
}
