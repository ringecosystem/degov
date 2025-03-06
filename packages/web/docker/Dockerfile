FROM node:22-alpine

COPY . /app

WORKDIR /app

RUN npm i -g pnpm \
  && pnpm install \
  && pnpm build

CMD ["pnpm", "start"]
