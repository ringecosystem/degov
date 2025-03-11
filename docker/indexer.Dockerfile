FROM node:22-alpine

ARG S6_OVERLAY_VERSION=3.2.0.2

ADD https://github.com/just-containers/s6-overlay/releases/download/v${S6_OVERLAY_VERSION}/s6-overlay-noarch.tar.xz /tmp
RUN tar -C / -Jxpf /tmp/s6-overlay-noarch.tar.xz
ADD https://github.com/just-containers/s6-overlay/releases/download/v${S6_OVERLAY_VERSION}/s6-overlay-x86_64.tar.xz /tmp
RUN tar -C / -Jxpf /tmp/s6-overlay-x86_64.tar.xz

COPY . /app

WORKDIR /app

RUN npm i -g @subsquid/cli \
  && mv docker/services.d /etc \
  && rm -rf packages/web \
  && cd packages/indexer \
  && yarn install \
  && yarn build

ENTRYPOINT ["/init"]
