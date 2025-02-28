FROM node:22-alpine

COPY . /app

WORKDIR /app

RUN npm i -g @subsquid/cli \
  && yarn install \
  && yarn build

ENTRYPOINT ["/app/scripts/entrypoint.sh"]
