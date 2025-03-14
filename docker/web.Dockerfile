## reference: https://github.com/vercel/next.js/blob/canary/examples/with-docker/Dockerfile

FROM node:22-alpine AS base

FROM base AS builder

WORKDIR /app
COPY . .

RUN corepack enable pnpm \
  && rm -rf packages/indexer \
  && pnpm install \
  && pnpm build:web

## orgnaize standalone
RUN cd packages/web \
  && cp -r public .next/standalone/packages/web \
  && cd .next \
  && cp -r static standalone/packages/web/.next

FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/packages/web/.next/standalone ./

USER nextjs

EXPOSE 3000

ENV PORT=3000

ENV HOSTNAME="0.0.0.0"
CMD ["node", "packages/web/server.js"]

