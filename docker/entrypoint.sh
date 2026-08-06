#!/bin/sh
# Applies pending migrations and seeds the exercise catalog, then serves the app.
#
# Both steps are idempotent, so this is safe on every container start: D1 skips
# migrations it has already applied, and the catalog upserts on its slug ids.
set -eu

: "${WRANGLER_PORT:=8787}"
: "${D1_STATE_DIR:=/data}"

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

mkdir -p "$D1_STATE_DIR"

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
  --ip 0.0.0.0 \
  --port "$WRANGLER_PORT" \
  --persist-to "$D1_STATE_DIR"
