# Working in this repository

## Commands

```bash
npm run dev              # vite dev server on :5173 (Workers runtime via @cloudflare/vite-plugin)
npm run typecheck        # react-router typegen + wrangler types + tsc
npm run lint             # eslint
npm test                 # vitest, inside workerd against a real local D1
npm run build            # production build
```

Run `npm run typecheck && npm run lint && npm test` before committing.

## Architecture in one pass

The unusual thing about this codebase is that **every product capability exists
twice over the same server code**: once as a UI control, once as a WebMCP tool.
Keeping those two in step is the main design constraint.

```
app/domain/contracts.ts     Zod schema per operation — the single source of truth.
                            Converted to JSON Schema for WebMCP tool inputs, and
                            re-parsed server-side. Change an operation here.
app/webmcp/                 The agent surface: runtime detection, the registration
                            hook, the confirmation handshake, and the tools.
app/routes/api.*.ts         Resource routes. The only server surface; the UI and
                            the tools both call these.
app/server/services/        Domain logic. Every function takes a userId and scopes
                            all queries by it — that is the authorization model.
```

### Adding a capability

1. Add the Zod schema to `app/domain/contracts.ts` with `.describe()` on every
   field — those descriptions are what the agent reads.
2. Implement it in `app/server/services/`, taking `userId` and scoping by it.
3. Expose it on a resource route via `handleApiRequest`.
4. Register the tool in `app/webmcp/tools/`, and add the matching UI control.

Skipping step 4's second half is the failure mode to watch for: a tool with no
UI equivalent means the person cannot see or undo what their agent did.

## Rules that are load-bearing

- **Weights are kilograms everywhere** — database, API, tool arguments. Convert
  only for display, in `app/lib/units.ts`.
- **The `X-Spotter-Actor` header is attribution, never authorization.** The
  agent runs in the page with the user's session and has exactly the user's
  privileges. Nothing may branch on it except the audit log.
- **Consequential tools confirm.** Anything that writes a plan, removes work, or
  ends a session goes through `requestConfirmation`. Reads do not.
- **Tools return errors as values**, not exceptions — `toolError(...)` carries a
  message the agent can act on; a thrown error reaches it as opaque failure.
- **Tools whose output includes user-authored text** set
  `untrustedContentHint: true` and wrap that text with `untrusted()`.
- **Workout tools register only on the workout page.** Scoping the tool list to
  what is on screen is what keeps the human and the agent on the same thing.

## Gotchas

- `document.modelContext` is canonical; `navigator.modelContext` is the
  deprecated alias. Resolve it only through `app/webmcp/runtime.ts`.
- `app/entry.server.tsx` exists solely to thread the CSP nonce into React
  Router's streaming scripts. Without it the page renders but never hydrates.
- D1 has no interactive transactions — use `db.batch()` (see `runBatch`).
- Adding a `wrangler.jsonc` binding means re-running `npm run typecheck` to
  regenerate `worker-configuration.d.ts`.
