FROM node:22-bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl tar \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    PORT=3000 \
    SNAPSHOT_PATH=/workspace/jsonspecs-node-server/snapshot.json

WORKDIR /workspace/jsonspecs-node-server

COPY package.json package-lock.json ./
COPY scripts ./scripts

RUN npm run deps:registry \
    && npm ci --omit=dev --no-audit --no-fund \
    && test "$(node -p 'require("jsonspecs/package.json").version')" = "$(node -p 'require("./package.json").config.jsonspecsVersion')" \
    && npm cache clean --force

COPY --chown=node:node server.js snapshot.json build-info.json ./
COPY --chown=node:node lib ./lib
COPY --chown=node:node samples ./samples

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl --fail --silent --show-error "http://127.0.0.1:${PORT:-3000}/health" > /dev/null || exit 1

CMD ["node", "server.js"]
