FROM node:22-alpine

COPY . /app

WORKDIR /app

RUN npm i -g pnpm \
  && rm -rf packages/indexer \
  && pnpm install \
  && pnpm build:web

CMD ["pnpm", "start:web"]
