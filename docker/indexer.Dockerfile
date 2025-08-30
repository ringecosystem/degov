FROM node:22-alpine

WORKDIR /app

ARG S6_OVERLAY_VERSION=3.2.1.0

ADD https://github.com/just-containers/s6-overlay/releases/download/v${S6_OVERLAY_VERSION}/s6-overlay-noarch.tar.xz /tmp
RUN tar -C / -Jxpf /tmp/s6-overlay-noarch.tar.xz
ADD https://github.com/just-containers/s6-overlay/releases/download/v${S6_OVERLAY_VERSION}/s6-overlay-x86_64.tar.xz /tmp
RUN tar -C / -Jxpf /tmp/s6-overlay-x86_64.tar.xz

COPY packages/indexer .
COPY docker/services.d /etc/services.d

RUN npm i -g @subsquid/cli \
  && yarn install \
  && yarn build \
  && yarn cache clean \
  && npm cache clean --force

ENTRYPOINT ["/init"]
