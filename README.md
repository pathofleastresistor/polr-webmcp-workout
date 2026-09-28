# Spotter

A workout log you and your browser agent share.

There is no sign-up. Press "Make my page" and you get a private link,
`/w/<key>`. That link is your account: bookmark it. Everything — your workouts,
history, settings — lives under it, and anyone who has it can see and change
them.

The agent reads your training history, programs your next workout, and logs sets
as you call them out. You stay on the page, see everything it does, and approve
anything consequential before it happens.

- **Stack** — React Router v8 (SSR) on Node, SQLite + Drizzle, Tailwind v4, Zod.
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

On the landing page:

| Tool                   |                                                                    |
| ---------------------- | ------------------------------------------------------------------ |
| `get_service_overview` | What this service does, and that making a page is the person's job |

On every page under a link:

| Tool                    |                                                                              |
| ----------------------- | ---------------------------------------------------------------------------- |
| `whoami`                | Units, experience, goal, weekly target                                       |
| `list_workouts`         | History with volume, sets, duration                                          |
| `get_workout`           | One session in full                                                          |
| `get_training_insights` | Volume per muscle group, staleness, streak, estimated 1RMs                   |
| `search_exercises`      | Catalog lookup — returns the ids a plan needs                                |
| `get_active_workout`    | The session in progress and what is still pending                            |
| `start_workout`         | Closes out whatever is running, begins a session with its plan, and opens it |

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

A typical exchange is one sentence: _"Start my workout."_ →
`get_training_insights` → `search_exercises` → `start_workout` with the plan
inline → you approve once → `log_set` per set → `finish_workout`.

That single `start_workout` call closes out a session you left running,
creates the new one and fills it in. The plan is a **required** argument, so
there is no way for an agent to start a blank session and hand the programming
back to you — an empty workout is a UI control, the dashboard's "Start a
workout" button, where choosing it is the whole meaning of the click. It has to
work that way round: the
planning tools register only on a workout's own page, so an agent standing on
the dashboard cannot reach `propose_workout_plan` or `finish_workout` — the
tools it would otherwise be told to call next do not exist at the moment it is
told to call them. The confirmation dialog names the session being closed and
lists the plan exercise by exercise, so the one approval still covers
everything that is about to happen.

Getting an agent to reliably _call_ it that way took four attempts, and the
three that failed all looked correct in review.
[Field notes](docs/webmcp-field-notes.md) records what broke, what it suggests
about the WebMCP spec, and what we would tell anyone else writing tools against
it.

---

## Running it locally

**Prerequisites:** Node 22+. No accounts, keys or cloud services.

```bash
npm install
echo 'APP_URL=http://localhost:5173' > .env
npm run db:migrate        # applies migrations and seeds 68 exercises
npm run dev               # http://localhost:5173 -> "Make my page"
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

- `APP_URL` is load-bearing. It is the origin allowlist for state-changing
  requests, the value the server pins each request to, and the base of the link
  people are shown. An `https://` value enables HSTS.
- The SQLite file needs durable storage. It is the only state worth backing up,
  and a platform with an ephemeral filesystem will lose it on every restart.

---

## Self-hosting with Docker

A plain Node process with SQLite on a volume. Migrations and the exercise
catalog are applied on every start, both idempotent, so there is no separate
provisioning step.

```bash
cp .env.example .env      # set SPOTTER_DOMAIN and APP_URL
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

`APP_URL` must be the public origin browsers use, with no trailing slash:

- it is the allowlist for state-changing requests — a mismatch means every
  mutation returns 403;
- it is the base of the link people copy and bookmark;
- an `https://` value enables HSTS.

TLS terminating at Caddy is fine: the checks compare the browser's `Origin`
header against `APP_URL`, not the scheme the container sees.

### State and backups

Everything worth keeping is the `spotter-data` volume (the SQLite database).
Back that up. Migrations and the catalog seed re-run on every container start
and are both idempotent.

### Lost links, and accounts from before links

Only a hash of each key is stored, so a lost link cannot be recovered — but a
new one can be minted for the same person, which also retires the old one.
Accounts created under the old Google sign-in have no link until you mint one:

```bash
npm run link              # lists people, their workout count and last activity
npm run link -- <userId>  # prints a fresh link for that person
```

In the container: `docker compose exec spotter npm run link`.

---

## Security

The threat model has an extra actor most apps do not: an agent driving the page
on the user's behalf, and possibly reading text written by someone else.

- **Access** — the link is a bearer credential: 128 random bits in the path.
  Only its SHA-256 is stored, so a copy of the database hands out no working
  links. There are no cookies, passwords or sessions. Pages send
  `Referrer-Policy: no-referrer` so the link never leaks to a site the page
  links to, and `X-Robots-Tag: noindex` so a link pasted somewhere public stays
  out of search results. Unknown links are a 404, rate limited per IP.
- **Authorization** — every service function takes a `userId` and scopes its
  queries by it. Another user's workout is indistinguishable from a nonexistent
  one, so ids leak no existence information. Covered by tests.
- **The agent has exactly the user's privileges.** It acts through the page's own
  link. The `X-Spotter-Actor` header is recorded for attribution and is never
  read as permission — treating it as one would be privilege escalation.
- **CSRF** — there are no ambient credentials to forge with, and every mutation
  also gets an explicit `Origin` check. Requests with a foreign or missing
  `Origin` are rejected with 403.
- **XSS** — strict CSP with a per-response nonce and no `unsafe-inline` for
  scripts. Notes and titles are free text, which makes this the load-bearing
  control; `app/entry.server.tsx` exists to thread the nonce into React Router's
  streaming scripts.
- **Prompt injection** — tools returning user-authored text set
  `untrustedContentHint` and delimit the text, so an agent treats a workout note
  as data rather than instructions.
- **Rate limiting** — per-user limits on tool traffic and per-IP on page
  creation and unknown links, because an agent can loop far faster than a person can click.
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

Tests run against a real in-memory SQLite database rather than a mock,
because much of the correctness lives in the SQL — unique indexes on `(workout,
position)` and `(exercise, set_index)`, cascades, and transaction atomicity.
Each test file gets its own database with the real migrations applied, so they
exercise the schema production actually has.

They cover the full lifecycle, the guards (no second active workout, how a
running session is closed when a new one starts, no re-planning over logged
sets, no editing a finished session), cross-user
isolation, link creation and lookup, the insights math, the rate limiter, the origin checks, and the
contract/JSON-Schema conversion.

---

## Not built yet

Payments (the service is intended to be subscription-based; nothing here assumes
a billing model). Also absent: workout templates, an exercise-creation UI, and
social features.

## Licence

MIT — see [LICENSE](./LICENSE).
