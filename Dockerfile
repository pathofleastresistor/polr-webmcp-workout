# Self-hosting image.
#
# A plain Node server: the app is a standard SSR application with a SQLite file
# behind it, so it runs anywhere Node does — a container, a VM, a PaaS — rather
# than on one vendor's runtime.

# ---- build ------------------------------------------------------------------
FROM node:22-bookworm-slim AS build

WORKDIR /app

# Install against the lockfile first so this layer caches across source edits.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

RUN npm run build

# ---- runtime ----------------------------------------------------------------
FROM node:22-bookworm-slim AS runtime

# CA certificates for outbound TLS (Google's OAuth endpoints).
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production

WORKDIR /app

# node_modules comes from the build stage rather than a second install: it
# carries better-sqlite3's compiled binding, built there against this same base
# image, so the two cannot disagree about the ABI.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/build ./build
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/server.js ./server.js
COPY --from=build /app/server ./server
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/scripts ./scripts
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh

RUN chmod +x /usr/local/bin/entrypoint.sh \
  # The SQLite file lives here; mount a volume over it to persist data.
  && mkdir -p /data \
  && chown -R node:node /app /data

# Never run the runtime as root.
USER node

ENV PORT=3000 \
    HOST=0.0.0.0 \
    DATABASE_PATH=/data/spotter.db

EXPOSE 3000

# Verifies the app answers, not just that the process is alive.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
