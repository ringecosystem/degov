FROM node:22-alpine AS base

WORKDIR /app

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable \
  && corepack prepare pnpm@10.32.1 --activate

FROM base AS s6

ARG S6_OVERLAY_VERSION=3.2.1.0
ARG TARGETARCH

RUN set -eux; \
  build_arch="${TARGETARCH:-$(uname -m)}"; \
  case "${build_arch}" in \
    amd64|x86_64) s6_arch="x86_64" ;; \
    arm64|aarch64) s6_arch="aarch64" ;; \
    *) echo "Unsupported architecture: ${build_arch}" >&2; exit 1 ;; \
  esac; \
  wget -O /tmp/s6-overlay-noarch.tar.xz "https://github.com/just-containers/s6-overlay/releases/download/v${S6_OVERLAY_VERSION}/s6-overlay-noarch.tar.xz"; \
  wget -O /tmp/s6-overlay-${s6_arch}.tar.xz "https://github.com/just-containers/s6-overlay/releases/download/v${S6_OVERLAY_VERSION}/s6-overlay-${s6_arch}.tar.xz"; \
  tar -C / -Jxpf /tmp/s6-overlay-noarch.tar.xz; \
  tar -C / -Jxpf /tmp/s6-overlay-${s6_arch}.tar.xz; \
  rm -f /tmp/s6-overlay-noarch.tar.xz /tmp/s6-overlay-${s6_arch}.tar.xz

FROM base AS manifests

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/indexer/package.json packages/indexer/package.json
COPY packages/web/package.json packages/web/package.json

FROM manifests AS builder

RUN apk add --no-cache python3 make g++ \
  && pnpm install --filter @degov/indexer... --frozen-lockfile

COPY packages/indexer packages/indexer

WORKDIR /app/packages/indexer

RUN pnpm run build

FROM manifests AS prod-deps

RUN pnpm install --filter @degov/indexer --prod --frozen-lockfile --ignore-scripts \
  && pnpm store prune

FROM s6 AS runner

COPY docker/services.d /etc/services.d

COPY --from=prod-deps /app/node_modules node_modules
COPY --from=prod-deps /app/packages/indexer/package.json packages/indexer/package.json
COPY --from=prod-deps /app/packages/indexer/node_modules packages/indexer/node_modules

COPY --from=builder /app/packages/indexer/lib packages/indexer/lib
COPY --from=builder /app/packages/indexer/db packages/indexer/db
COPY --from=builder /app/packages/indexer/scripts/start.sh packages/indexer/scripts/start.sh
COPY --from=builder /app/packages/indexer/scripts/graphql-server.sh packages/indexer/scripts/graphql-server.sh
COPY --from=builder /app/packages/indexer/schema.graphql packages/indexer/schema.graphql
COPY --from=builder /app/packages/indexer/commands.json packages/indexer/commands.json
COPY --from=builder /app/packages/indexer/squid.yaml packages/indexer/squid.yaml

WORKDIR /app/packages/indexer

ENTRYPOINT ["/init"]
