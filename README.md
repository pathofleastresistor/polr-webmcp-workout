# Spotter

A workout tracker and coach built **WebMCP-first**: it assumes the visitor is a
person _and_ their browsing agent, working the same session together.

The agent reads your training history, programs your next workout, and logs sets
as you call them out. You stay on the page, see everything it does, and approve
anything consequential before it happens.

- **Stack** — React Router v8 (SSR) on Node, SQLite + Drizzle, Better Auth with
  Google sign-in, Tailwind v4, Zod.
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

| Tool                    |                                                                   |
| ----------------------- | ----------------------------------------------------------------- |
| `whoami`                | Name, units, experience, goal, weekly target                      |
| `list_workouts`         | History with volume, sets, duration                               |
| `get_workout`           | One session in full                                               |
| `get_training_insights` | Volume per muscle group, staleness, streak, estimated 1RMs        |
| `search_exercises`      | Finds movements they already train — returns the ids a plan needs |
| `create_exercise`       | Adds a movement to their library; matches rather than duplicating |
| `get_active_workout`    | The session in progress and what is still pending                 |
| `start_workout`         | Begins a session and opens it                                     |

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
→ `get_training_insights` → `search_exercises` (→ `create_exercise` for
anything new) → `start_workout` →
`propose_workout_plan` → you approve → `log_set` per set → `finish_workout`.

---

## Try it without Google (demo mode)

Setting up an OAuth client just to look around is a lot of ceremony. Demo mode
replaces Google sign-in with a one-click throwaway account, seeded with eight
weeks of sample training so the dashboard, the insights and every read tool have
something real to work with.

```bash
npm install

printf 'BETTER_AUTH_SECRET=%s\nDEMO_MODE=true\n' "$(openssl rand -base64 32)" > .env

npm run db:migrate
npm run dev               # http://localhost:5173 -> "Explore the demo"
```

To put it on a public URL, set `DEMO_MODE=true` in the environment of a
[self-hosted deployment](#self-hosting-with-docker). Set `APP_URL` to that
public origin so cookies are marked `Secure` and the origin check matches.

**Demo mode is an authentication bypass.** It is off unless `DEMO_MODE` is
exactly `"true"`, it is absent from every committed env file, it logs a startup
warning, and it shows a persistent banner on every page. `/demo/start` returns
404 whenever it is off.

Switching it off later revokes the demo logins: demo accounts are flagged
`user_profile.is_demo`, and sessions belonging to one are rejected once the flag
is unset — so a cookie minted during the demo does not survive the same
deployment becoming real. The demo rows stay in the database; delete them with:

```sql
DELETE FROM user WHERE id IN (SELECT user_id FROM user_profile WHERE is_demo = 1);
```

---

## Running it locally (with Google)

**Prerequisites:** Node 22+ and a Google OAuth client. No cloud account.

```bash
npm install
```

**1. Configure secrets**

```bash
cp .env.example .env
```

Fill in `.env` (gitignored):

- `BETTER_AUTH_SECRET` — `openssl rand -base64 32`
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — from the
  [Google Cloud console](https://console.cloud.google.com/apis/credentials).
  Create an **OAuth 2.0 Web application** client and add
  `http://localhost:5173/api/auth/callback/google` as an authorised redirect URI.

**2. Create the database**

```bash
npm run db:migrate       # applies migrations
```

Creates `./data/spotter.db`. Idempotent, so re-running is safe.

There is no exercise catalog to seed. The library starts empty and is built by
the person and their agent from what they actually train.

**3. Run**

```bash
npm run dev               # http://localhost:5173
```

WebMCP needs Chrome 146+ or Edge 147+. On anything else the app works fully by
hand and the agent console says so — it does not silently do nothing.

---

## Deploying

**Self-hosting is the supported path today**, and the section below covers it.

There is deliberately nothing vendor-specific left to configure. This is an
ordinary Node SSR process with a SQLite file next to it: no proprietary runtime,
no managed database, no platform bindings. Deploying somewhere else is a
question of where the process runs and where that file lives, not a rewrite —
which is the point. Support for a range of hosting providers is intended to
follow; the architecture is the part that had to come first.

Whatever runs it, three things matter:

- `APP_URL` is load-bearing. It is the OAuth redirect base, the origin allowlist
  for state-changing requests, and the value the server pins each request to. An
  `https://` value is what flips cookies to `Secure` and enables HSTS.
- Add `https://<your-domain>/api/auth/callback/google` to the Google client's
  authorised redirect URIs.
- The SQLite file needs durable storage. It is the only state worth backing up,
  and a platform with an ephemeral filesystem will lose it on every restart.

---

## Self-hosting with Docker

A plain Node process with SQLite on a volume. Migrations are applied on every
start, and are idempotent, so there is no separate provisioning step.

```bash
cp .env.example .env      # set SPOTTER_DOMAIN, APP_URL, BETTER_AUTH_SECRET, Google creds
docker compose up -d
```

The sample compose file runs Caddy in front, which obtains a certificate
automatically. **That is a functional requirement, not a nicety:** WebMCP is a
secure-context API, so on plain `http://` (other than localhost) the browser
never exposes `document.modelContext`, tools silently fail to register, and the
agent half of the product does nothing. The app still works by hand, which is
what makes the failure easy to miss.

Already running Caddy on the host? Drop the `caddy` service, publish
`spotter`'s port, and point your existing Caddyfile at it — see
`docker/Caddyfile` for the one header that matters.

### Getting `APP_URL` right

`APP_URL` must be the public origin browsers use, with no trailing slash. It is
load-bearing three times over:

- it is the OAuth redirect base, so Google's authorised redirect URI must be
  exactly `${APP_URL}/api/auth/callback/google`;
- it is the allowlist for state-changing requests — a mismatch means every
  mutation returns 403;
- an `https://` value is what marks cookies `Secure` and enables HSTS.

TLS terminating at Caddy is fine: the checks compare the browser's `Origin`
header against `APP_URL`, not the scheme the container sees.

### State and backups

Everything worth keeping is the `spotter-data` volume (the SQLite database).
Back that up. Migrations re-run on every container start
and are both idempotent.

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
- **Rate limiting** — per-user limits on tool traffic and per-IP
  on auth, because an agent can loop far faster than a person can click.
- **Input validation** — Zod at the tool boundary and again on the server. The
  server's check is the only one trusted.
- **Secrets** — environment variables only, never committed. `.env` is gitignored.

`npm audit` reports advisories in `esbuild` and `drizzle-kit`. Both are dev-only
transitive dependencies (the dev server and the migration generator); neither is
in the server's dependency graph at runtime.

---

## Tests

```bash
npm test
```

66 tests run against a real in-memory SQLite database rather than a mock,
because much of the correctness lives in the SQL — unique indexes on `(workout,
position)` and `(exercise, set_index)`, cascades, and transaction atomicity.
Each test file gets its own database with the real migrations applied, so they
exercise the schema production actually has.

They cover the full lifecycle, the guards (no second active workout, no
re-planning over logged sets, no editing a finished session), cross-user
isolation, the insights math, the rate limiter, the origin checks, and the
contract/JSON-Schema conversion.

---

## Not built yet

Payments (the service is intended to be subscription-based; nothing here assumes
a billing model). Also absent: workout templates, an exercise-creation UI, and
social features.

## Licence

MIT — see [LICENSE](./LICENSE).
