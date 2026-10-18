# syntax=docker/dockerfile:1.7
# Hardened multi-stage image for the API and worker runtime.
# Build:  docker build -t cvg-operational-harness:local .
# Notes:  run with --read-only --cap-drop=ALL --security-opt no-new-privileges
#         and mount a tmpfs at /tmp when the orchestrator supports it.

FROM node:22.23.2-bookworm-slim@sha256:48e4b67d85f87bd551df43704e24d252f56cc5f8e9718841aace50f19948f0f9 AS build
WORKDIR /app
ENV NPM_CONFIG_FUND=false NPM_CONFIG_AUDIT=false
COPY package.json package-lock.json ./
COPY tsconfig.base.json tsconfig.json tsconfig.typecheck.json tsconfig.runtime.json vite.config.mts ./
COPY apps ./apps
COPY packages ./packages
COPY legacy ./legacy
COPY scripts ./scripts
RUN npm ci --ignore-scripts && npm run build:web && npm run build:runtime

# Production dependencies and the runtime account, resolved with the same
# pinned Node image the build used.
FROM node:22.23.2-bookworm-slim@sha256:48e4b67d85f87bd551df43704e24d252f56cc5f8e9718841aace50f19948f0f9 AS prod-deps
ENV NODE_ENV=production NPM_CONFIG_FUND=false NPM_CONFIG_AUDIT=false
WORKDIR /app
COPY --from=build /tmp/cvg-runtime/ ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force \
  && printf 'root:x:0:0:root:/root:/sbin/nologin\nnobody:x:65534:65534:nobody:/nonexistent:/sbin/nologin\ncvg:x:10001:10001:cvg:/app:/sbin/nologin\n' > /tmp/passwd \
  && printf 'root:x:0:\nnobody:x:65534:\ncvg:x:10001:\n' > /tmp/group

# PROD-0373 (barra 0373, condição 7): no shell, no package manager. The exact
# pinned Node binary runs on the distroless C runtime; API and worker share
# this image (worker: `node apps/worker/dist/main.js`). Application files stay
# owned by root, so the `cvg` account cannot rewrite them even without
# --read-only.
FROM gcr.io/distroless/cc-debian12:nonroot@sha256:9dac0a79194e45a7da0158a9c6da57b217585af0786db3845d1f0ec1a0dd182f AS runtime
ENV NODE_ENV=production
COPY --from=prod-deps /usr/local/bin/node /usr/local/bin/node
COPY --from=prod-deps /tmp/passwd /etc/passwd
COPY --from=prod-deps /tmp/group /etc/group
WORKDIR /app
COPY --from=prod-deps /app ./
USER cvg
EXPOSE 3000
# One probe for both commands: /live for the API, the heartbeat liveness
# file for the worker (scripts/runtime-healthcheck.mjs).
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD ["node", "scripts/runtime-healthcheck.mjs"]
CMD ["node", "apps/api/dist/main.js"]

FROM nginxinc/nginx-unprivileged:1.27-alpine@sha256:65e3e85dbaed8ba248841d9d58a899b6197106c23cb0ff1a132b7bfe0547e4c0 AS web
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
COPY deploy/nginx.web.conf /etc/nginx/conf.d/default.conf
EXPOSE 8080
