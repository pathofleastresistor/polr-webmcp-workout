#!/bin/sh
# Applies pending migrations and seeds the exercise catalog, then serves the app.
#
# Both steps are idempotent, so this is safe on every container start: the
# migrator skips what it has already applied, and the catalog upserts on its
# slug ids.
set -eu

: "${PORT:=3000}"
: "${DATABASE_PATH:=/data/spotter.db}"

fail() {
  echo "spotter: $1" >&2
  exit 1
}

[ -n "${APP_URL:-}" ] || fail \
  "APP_URL is not set. It must be the public origin browsers use, e.g. https://spotter.example.com (no trailing slash)."

case "$APP_URL" in
  */) fail "APP_URL must not have a trailing slash." ;;
  http://*|https://*) ;;
  *) fail "APP_URL must be an absolute URL including the scheme, e.g. https://spotter.example.com" ;;
esac

# WebMCP is a secure-context API: over plain http (other than localhost) the
# browser will not expose document.modelContext, tools silently fail to
# register, and the agent half of the product does nothing. Worth saying out
# loud rather than letting it be discovered.
case "$APP_URL" in
  https://*|http://localhost*|http://127.0.0.1*) ;;
  *) echo "spotter: WARNING - APP_URL is not https and not localhost. Browsers will not expose WebMCP tools on this origin; the app will work by hand only." >&2 ;;
esac

node scripts/migrate.mjs

# exec so the server receives SIGTERM directly and the container stops cleanly.
exec node server.js
