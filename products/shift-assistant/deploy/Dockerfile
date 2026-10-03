# syntax=docker/dockerfile:1.7
# Assistente de Plantão (SPEC 0177). Build from the repository root:
#   docker build -f products/shift-assistant/deploy/Dockerfile -t cvg-shift-assistant:local .
# The runtime image holds only Node and one bundled file: no shell tools are
# needed, no package manager runs at runtime, and the process is not root.

FROM node:22.23.2-bookworm-slim@sha256:48e4b67d85f87bd551df43704e24d252f56cc5f8e9718841aace50f19948f0f9 AS build
WORKDIR /app
ENV NPM_CONFIG_FUND=false NPM_CONFIG_AUDIT=false
COPY package.json package-lock.json ./
COPY tsconfig.base.json tsconfig.json ./
COPY apps ./apps
COPY packages ./packages
COPY legacy ./legacy
COPY products ./products
COPY scripts/build-public-workspace.mjs ./scripts/build-public-workspace.mjs
RUN npm ci --ignore-scripts \
  && npm run build --workspace @cvg/shift-assistant

FROM node:22.23.2-bookworm-slim@sha256:48e4b67d85f87bd551df43704e24d252f56cc5f8e9718841aace50f19948f0f9 AS runtime
ENV NODE_ENV=production SHIFT_DATA_DIR=/data SHIFT_PORT=3400 SHIFT_HOST=0.0.0.0
RUN groupadd --system --gid 10001 cvg \
  && useradd --system --uid 10001 --gid cvg --home-dir /app --shell /usr/sbin/nologin cvg \
  && mkdir -p /data && chown cvg:cvg /data
WORKDIR /app
COPY --from=build --chown=cvg:cvg /app/products/shift-assistant/dist/shift-assistant.mjs ./shift-assistant.mjs
USER cvg
VOLUME ["/data"]
EXPOSE 3400
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.SHIFT_PORT||3400)+'/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["node", "shift-assistant.mjs"]
