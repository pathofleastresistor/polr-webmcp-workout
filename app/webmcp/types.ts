/**
 * Minimal typings for the W3C Web Model Context API (WebMCP).
 *
 * Written against the Community Group draft and Chrome's implementation rather
 * than pulled from a package, so the surface we depend on is explicit and
 * reviewable. The API has moved namespace twice (`window.agent` ->
 * `navigator.modelContext` -> `document.modelContext`), so keeping our own
 * declaration also means one file to update when it moves again.
 *
 * @see https://webmachinelearning.github.io/webmcp/
 */

export interface TextContent {
  type: "text";
  text: string;
}

export type ContentBlock =
  TextContent | { type: string; [key: string]: unknown };

/** What a tool's `execute` resolves to. Mirrors MCP's `CallToolResult`. */
export interface CallToolResult {
  /** Prose for the model. Always include something human-readable here. */
  content: ContentBlock[];
  /** Machine-readable payload, validated against `outputSchema` when present. */
  structuredContent?: unknown;
  isError?: boolean;
}

/**
 * Behaviour hints agents use to decide whether a tool needs confirmation, can
 * be retried, or may be called speculatively.
 */
export interface ToolAnnotations {
  title?: string;
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
  /**
   * Marks output that includes text this page did not author — workout notes
   * and titles written by the user. Signals to the agent that the content is
   * data, not instructions.
   */
  untrustedContentHint?: boolean;
}

/** Per-call handle the runtime passes to `execute`. */
export interface ModelContextClient {
  /**
   * Hands control back to the person for a moment: the browser surfaces the
   * page and grants transient activation, then runs the callback. This is the
   * mechanism behind every confirmation in this app.
   */
  requestUserInteraction?<T>(callback: () => Promise<T>): Promise<T>;
}

export interface ToolDescriptor<TArgs = Record<string, unknown>> {
  name: string;
  title?: string;
  description: string;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  annotations?: ToolAnnotations;
  execute: (
    args: TArgs,
    client: ModelContextClient,
  ) => Promise<CallToolResult> | CallToolResult;
}

export interface RegisterToolOptions {
  /** Aborting unregisters the tool. Replaces the removed `unregisterTool`. */
  signal?: AbortSignal;
}

export interface ModelContext {
  registerTool(
    tool: ToolDescriptor<never>,
    options?: RegisterToolOptions,
  ): Promise<void>;
  addEventListener?(type: "toolchange", listener: () => void): void;
  removeEventListener?(type: "toolchange", listener: () => void): void;
}

declare global {
  interface Document {
    readonly modelContext?: ModelContext;
  }
  interface Navigator {
    /** @deprecated Moved to `document.modelContext` in Chrome 150. */
    readonly modelContext?: ModelContext;
  }
}
