#!/bin/sh
# Applies pending migrations and seeds the exercise catalog, then serves the app.
#
# Both steps are idempotent, so this is safe on every container start: D1 skips
# migrations it has already applied, and the catalog upserts on its slug ids.
set -eu

: "${WRANGLER_PORT:=8787}"
: "${D1_STATE_DIR:=/data}"

# Serve the *built* worker, not the source config.
#
# wrangler.jsonc at the repo root has `main: ./workers/app.ts`, which the
# runtime image deliberately does not contain — it ships the bundle, not the
# sources. Pointing `wrangler dev` at that config fails with "The entry-point
# file at workers/app.ts was not found" and the container restart-loops.
#
# The Cloudflare vite plugin already emits a fully resolved config next to the
# bundle it describes, with `main`, the assets directory and the migrations
# directory all rewritten to match. That is the one to serve.
CONFIG=./build/server/wrangler.json

fail() {
  echo "spotter: $1" >&2
  exit 1
}

[ -n "${BETTER_AUTH_SECRET:-}" ] || fail \
  "BETTER_AUTH_SECRET is not set. Generate one with: openssl rand -base64 32"

[ -n "${APP_URL:-}" ] || fail \
  "APP_URL is not set. It must be the public origin browsers use, e.g. https://spotter.example.com (no trailing slash)."

# APP_URL shape is checked before credentials: it is the cheaper error, and
# reporting it second would hide it behind the Google message.
case "$APP_URL" in
  */) fail "APP_URL must not have a trailing slash." ;;
  http://*|https://*) ;;
  *) fail "APP_URL must be an absolute URL including the scheme, e.g. https://spotter.example.com" ;;
esac

if [ -z "${GOOGLE_CLIENT_ID:-}" ] && [ "${DEMO_MODE:-}" != "true" ]; then
  fail "GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET are not set. Configure Google sign-in, or set DEMO_MODE=true to explore without it."
fi

# WebMCP is a secure-context API: over plain http (other than localhost) the
# browser will not expose document.modelContext, tools silently fail to
# register, and the agent half of the product does nothing. Worth saying out
# loud rather than letting it be discovered.
case "$APP_URL" in
  https://*|http://localhost*|http://127.0.0.1*) ;;
  *) echo "spotter: WARNING - APP_URL is not https and not localhost. Browsers will not expose WebMCP tools on this origin; the app will work by hand only." >&2 ;;
esac

[ -f "$CONFIG" ] || fail \
  "$CONFIG is missing. The image was built without a completed 'npm run build'."

mkdir -p "$D1_STATE_DIR"

# Hand the configuration to the Worker as bindings.
#
# `wrangler dev` does not turn the process environment into Worker bindings, so
# passing these through `docker run -e` alone leaves `env` empty inside the
# Worker: readConfig() throws, workers/app.ts fails closed, and every request
# is a 503. A `.dev.vars` beside the config is the mechanism wrangler does
# read.
#
# APP_URL is the exception and goes through --var below. The build bakes
# `vars.APP_URL` into the generated config (it comes from wrangler.jsonc), and
# a config `vars` entry outranks `.dev.vars` for the same key — so setting it
# here would be silently ignored and the deployment would run against
# localhost.
DEV_VARS="$(dirname "$CONFIG")/.dev.vars"
umask 077
{
  echo "BETTER_AUTH_SECRET=$BETTER_AUTH_SECRET"
  [ -n "${DEMO_MODE:-}" ] && echo "DEMO_MODE=$DEMO_MODE"
  [ -n "${GOOGLE_CLIENT_ID:-}" ] && echo "GOOGLE_CLIENT_ID=$GOOGLE_CLIENT_ID"
  [ -n "${GOOGLE_CLIENT_SECRET:-}" ] && echo "GOOGLE_CLIENT_SECRET=$GOOGLE_CLIENT_SECRET"
  true
} > "$DEV_VARS"
umask 022

# These two deliberately use the root wrangler.jsonc rather than $CONFIG: they
# only need the D1 binding and the migrations directory, both of which it
# describes correctly, and neither reads `main`.
echo "spotter: applying migrations"
npx wrangler d1 migrations apply polr-workout-db --local \
  --persist-to "$D1_STATE_DIR"

echo "spotter: seeding exercise catalog"
npx wrangler d1 execute polr-workout-db --local \
  --persist-to "$D1_STATE_DIR" \
  --file=./drizzle/seed/exercises.sql >/dev/null

echo "spotter: serving on 0.0.0.0:${WRANGLER_PORT} (APP_URL=${APP_URL})"
# exec so wrangler receives SIGTERM directly and the container stops cleanly.
exec npx wrangler dev \
  --config "$CONFIG" \
  --var "APP_URL:$APP_URL" \
  --ip 0.0.0.0 \
  --port "$WRANGLER_PORT" \
  --persist-to "$D1_STATE_DIR"
