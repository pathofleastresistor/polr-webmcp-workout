import type { Config } from "@react-router/dev/config";

export default {
  // Server-side rendered. Agents that fetch the page without executing script
  // still receive meaningful HTML, and WebMCP tools hydrate on top of it.
  ssr: true,
} satisfies Config;
