FROM node:22-alpine

WORKDIR /app

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

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/indexer/package.json packages/indexer/package.json
COPY packages/web/package.json packages/web/package.json
COPY docker/services.d /etc/services.d

RUN apk add --no-cache --virtual .build-deps python3 make g++ \
  && npm i -g @subsquid/cli \
  && corepack enable \
  && corepack prepare pnpm@10.32.1 --activate \
  && pnpm install --filter @degov/indexer --frozen-lockfile

COPY packages/indexer packages/indexer

WORKDIR /app/packages/indexer

RUN pnpm run build \
  && apk del .build-deps \
  && pnpm store prune \
  && npm cache clean --force

ENTRYPOINT ["/init"]
