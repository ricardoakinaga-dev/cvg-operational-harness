# syntax=docker/dockerfile:1.7
# Assistente de Plantão (SPEC 0177; hardening SPEC 0179 section 9, AUD-0621
# F25). Build from the repository root:
#   docker build -f products/shift-assistant/deploy/Dockerfile --target runtime -t cvg-shift-assistant:local .
# The runtime image holds the distroless C runtime, the pinned Node binary
# and one bundled file: no shell, no package manager, no shell utilities, and
# the process runs as cvg (10001:10001). Base images are pinned by digest.

FROM node:22.23.2-bookworm-slim@sha256:48e4b67d85f87bd551df43704e24d252f56cc5f8e9718841aace50f19948f0f9 AS build
WORKDIR /app
ENV NPM_CONFIG_FUND=false NPM_CONFIG_AUDIT=false
COPY package.json package-lock.json ./
COPY tsconfig.base.json tsconfig.json ./
COPY apps ./apps
COPY packages ./packages
COPY legacy ./legacy
# Only what the product build reads: never deploy/ (an operator's .env lives
# there) or docs.
COPY products/shift-assistant/package.json products/shift-assistant/tsconfig.json products/shift-assistant/tsconfig.build.json ./products/shift-assistant/
COPY products/shift-assistant/src ./products/shift-assistant/src
COPY scripts/build-public-workspace.mjs ./scripts/build-public-workspace.mjs
RUN npm ci --ignore-scripts \
  && npm run build --workspace @cvg/shift-assistant

# The exact Node binary and the minimal account files, from the same pinned
# image the build used. /data is created empty, owned by cvg, mode 0700.
FROM node:22.23.2-bookworm-slim@sha256:48e4b67d85f87bd551df43704e24d252f56cc5f8e9718841aace50f19948f0f9 AS node-runtime
RUN printf 'root:x:0:0:root:/root:/sbin/nologin\nnobody:x:65534:65534:nobody:/nonexistent:/sbin/nologin\ncvg:x:10001:10001:cvg:/app:/sbin/nologin\n' > /tmp/passwd \
  && printf 'root:x:0:\nnobody:x:65534:\ncvg:x:10001:\n' > /tmp/group \
  && mkdir -p /tmp/rootfs/data \
  && chown 10001:10001 /tmp/rootfs/data \
  && chmod 0700 /tmp/rootfs/data

FROM gcr.io/distroless/cc-debian12:nonroot@sha256:9dac0a79194e45a7da0158a9c6da57b217585af0786db3845d1f0ec1a0dd182f AS runtime
ENV NODE_ENV=production SHIFT_DATA_DIR=/data SHIFT_PORT=3400 SHIFT_HOST=0.0.0.0
COPY --from=node-runtime /usr/local/bin/node /usr/local/bin/node
COPY --from=node-runtime /tmp/passwd /etc/passwd
COPY --from=node-runtime /tmp/group /etc/group
COPY --from=node-runtime /tmp/rootfs/ /
WORKDIR /app
# Owned by root: the cvg account cannot rewrite the program.
COPY --from=build /app/products/shift-assistant/dist/shift-assistant.mjs ./shift-assistant.mjs
USER cvg
VOLUME ["/data"]
EXPOSE 3400
HEALTHCHECK --interval=10s --timeout=2s --start-period=10s --retries=2 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.SHIFT_PORT||3400)+'/health/ready').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["node", "shift-assistant.mjs"]
