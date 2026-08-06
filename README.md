# Spotter

A workout tracker and coach built **WebMCP-first**: it assumes the visitor is a
person _and_ their browsing agent, working the same session together.

The agent reads your training history, programs your next workout, and logs sets
as you call them out. You stay on the page, see everything it does, and approve
anything consequential before it happens.

- **Stack** — React Router v8 (SSR) on Cloudflare Workers, D1 + Drizzle, Better
  Auth with Google sign-in, Tailwind v4, Zod.
- **Agent interface** — [WebMCP](https://webmachinelearning.github.io/webmcp/)
  (`document.modelContext`), 15 tools scoped to what is on screen.

---

## The design idea

Most "AI features" bolt a chat box onto an app. This inverts that: the page is a
shared workspace, and the agent is a peer user of it with its own typed
interface.

Three decisions follow from that, and they are what most of the code is about.

**One server surface, two front doors.** Every operation is defined once as a Zod
schema in `app/domain/contracts.ts`. That schema becomes the WebMCP tool's JSON
Schema _and_ the server's validator. A button click and a tool call hit the same
resource route, the same authorization check, the same audit log. The two paths
cannot drift, because there is only one path.

**Tools are scoped to what the human can see.** Read tools are registered
account-wide. Tools that edit a workout register only while that workout's page
is mounted, and refuse a `workoutId` other than the one on screen. An agent
cannot log sets into a session the person is not looking at.

**The agent asks before it acts.** Reads happen freely. Writing a plan, removing
an exercise, or ending a session pauses for an in-page confirmation, routed
through `client.requestUserInteraction()` so the browser surfaces the tab first —
otherwise a dialog could open where nobody sees it and silence would read as
consent. Dismissing the dialog counts as _no_.

Everything the agent does lands in an activity log the person can read, both live
in the agent console and persisted in `agent_event`.

---

## The tools

Registered on every page, signed out:

| Tool                   |                                                              |
| ---------------------- | ------------------------------------------------------------ |
| `get_service_overview` | What this service does, and that sign-in is the person's job |

Signed in, everywhere:

| Tool                    |                                                            |
| ----------------------- | ---------------------------------------------------------- |
| `whoami`                | Name, units, experience, goal, weekly target               |
| `list_workouts`         | History with volume, sets, duration                        |
| `get_workout`           | One session in full                                        |
| `get_training_insights` | Volume per muscle group, staleness, streak, estimated 1RMs |
| `search_exercises`      | Catalog lookup — returns the ids a plan needs              |
| `get_active_workout`    | The session in progress and what is still pending          |
| `start_workout`         | Begins a session and opens it                              |

On the workout page only, while the session is active:

| Tool                           |                                                       |
| ------------------------------ | ----------------------------------------------------- |
| `propose_workout_plan`         | The suggestion flow — fills the page, person approves |
| `log_set`                      | Records a set; the one called most during a session   |
| `add_exercise_to_workout`      | Extend mid-session                                    |
| `remove_exercise_from_workout` | Drop an exercise                                      |
| `add_workout_note`             | Coaching context that carries to later sessions       |
| `finish_workout`               | Close out and fold into history                       |
| `cancel_workout`               | Discard without recording                             |

A typical exchange: _"Look at what I've been neglecting and give me 45 minutes."_
→ `get_training_insights` → `search_exercises` → `start_workout` →
`propose_workout_plan` → you approve → `log_set` per set → `finish_workout`.

---

## Running it locally

**Prerequisites:** Node 22+, a Cloudflare account, and a Google OAuth client.

```bash
npm install
```

**1. Create the database**

```bash
npx wrangler d1 create polr-workout-db
```

Copy the printed `database_id` into `wrangler.jsonc`.

**2. Configure secrets**

```bash
cp .dev.vars.example .dev.vars
```

Fill in `.dev.vars` (gitignored):

- `BETTER_AUTH_SECRET` — `openssl rand -base64 32`
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — from the
  [Google Cloud console](https://console.cloud.google.com/apis/credentials).
  Create an **OAuth 2.0 Web application** client and add
  `http://localhost:5173/api/auth/callback/google` as an authorised redirect URI.

**3. Migrate and seed**

```bash
npm run db:migrate:local
npm run db:seed:local     # 68 exercises
```

**4. Run**

```bash
npm run dev               # http://localhost:5173
```

WebMCP needs Chrome 146+ or Edge 147+. On anything else the app works fully by
hand and the agent console says so — it does not silently do nothing.

---

## Deploying

```bash
npx wrangler d1 migrations apply polr-workout-db --remote
npm run db:seed:remote

wrangler secret put BETTER_AUTH_SECRET
wrangler secret put GOOGLE_CLIENT_ID
wrangler secret put GOOGLE_CLIENT_SECRET

npm run deploy
```

Then set `APP_URL` in `wrangler.jsonc` `vars` to the deployed origin (no
trailing slash) and add `https://<your-domain>/api/auth/callback/google` to the
Google client's authorised redirect URIs. `APP_URL` is load-bearing: it is the
OAuth redirect base _and_ the origin allowlist for state-changing requests, and
an `https://` value is what flips cookies to `Secure` and enables HSTS.

---

## Security

The threat model has an extra actor most apps do not: an agent driving the page
on the user's behalf, and possibly reading text written by someone else.

- **Auth** — Google only, via Better Auth. No passwords stored. `HttpOnly`,
  `SameSite=Lax`, `Secure` (on HTTPS) session cookies with 30-day sliding expiry.
- **Authorization** — every service function takes a `userId` and scopes its
  queries by it. Another user's workout is indistinguishable from a nonexistent
  one, so ids leak no existence information. Covered by tests.
- **The agent has exactly the user's privileges.** It acts through the page's own
  session. The `X-Spotter-Actor` header is recorded for attribution and is never
  read as permission — treating it as one would be privilege escalation.
- **CSRF** — `SameSite=Lax` plus an explicit `Origin` check on every mutation.
  Requests with a foreign or missing `Origin` are rejected with 403.
- **XSS** — strict CSP with a per-response nonce and no `unsafe-inline` for
  scripts. Notes and titles are free text, which makes this the load-bearing
  control; `app/entry.server.tsx` exists to thread the nonce into React Router's
  streaming scripts.
- **Prompt injection** — tools returning user-authored text set
  `untrustedContentHint` and delimit the text, so an agent treats a workout note
  as data rather than instructions.
- **Rate limiting** — per-user Cloudflare rate limits on tool traffic and per-IP
  on auth, because an agent can loop far faster than a person can click.
- **Input validation** — Zod at the tool boundary and again on the server. The
  server's check is the only one trusted.
- **Secrets** — Worker secrets only. `.dev.vars` is gitignored.

`npm audit` reports advisories in `esbuild`, `undici` and `drizzle-kit`. All are
dev-only transitive dependencies (dev server, Wrangler's local runtime, the
migration generator); none are in the Worker's dependency graph at runtime.

---

## Tests

```bash
npm test
```

32 tests run inside `workerd` against a real local D1 rather than a mock, because
much of the correctness lives in the SQL — unique indexes on `(workout,
position)` and `(exercise, set_index)`, cascades, and `batch()` atomicity. They
cover the full lifecycle, the guards (no second active workout, no re-planning
over logged sets, no editing a finished session), cross-user isolation, the
insights math, and the contract/JSON-Schema conversion.

---

## Not built yet

Payments (the service is intended to be subscription-based; nothing here assumes
a billing model). Also absent: workout templates, an exercise-creation UI, and
social features.

## Licence

MIT — see [LICENSE](./LICENSE).
