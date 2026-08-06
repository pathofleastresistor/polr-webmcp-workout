# Self-hosting image.
#
# Runs the app on workerd (the same runtime Cloudflare Workers use) via
# `wrangler dev`, with D1 backed by a local SQLite file. That keeps a
# self-hosted instance behaviourally identical to a deployed one — same
# runtime, same bindings, same migrations — rather than a second code path.
#
# Deploying to Cloudflare instead? You do not need this file; use `npm run
# deploy`.

# ---- build ------------------------------------------------------------------
FROM node:22-bookworm-slim AS build

WORKDIR /app

# Install against the lockfile first so this layer caches across source edits.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# `wrangler types` regenerates worker-configuration.d.ts, which is gitignored,
# so the build must produce it rather than expect it in the context.
RUN npm run build

# ---- runtime ----------------------------------------------------------------
FROM node:22-bookworm-slim AS runtime

# wrangler downloads nothing at runtime, but workerd needs libstdc++ and CA
# certificates for outbound TLS (Google's OAuth endpoints).
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production

WORKDIR /app

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/build ./build
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/wrangler.jsonc ./wrangler.jsonc
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/scripts ./scripts
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh

RUN chmod +x /usr/local/bin/entrypoint.sh \
  # D1's SQLite files live here; mount a volume over it to persist data.
  && mkdir -p /data \
  && chown -R node:node /app /data

# Never run the runtime as root.
USER node

ENV WRANGLER_PORT=8787 \
    D1_STATE_DIR=/data

EXPOSE 8787

# Verifies the app answers, not just that the process is alive.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.WRANGLER_PORT||8787)+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
