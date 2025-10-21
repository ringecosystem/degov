## reference: https://github.com/vercel/next.js/blob/canary/examples/with-docker/Dockerfile

FROM node:22-alpine AS base

FROM base AS builder

COPY . /code

RUN corepack enable pnpm \
  && mv /code/packages/web /app \
  && mv /code/degov.yml /app \
  && rm -rf /code \
  && cd /app \
  && pnpm install --frozen-lockfile \
  && pnpm build

FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV DEGOV_CONFIG_PATH=/app/degov.yml

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone .
COPY --from=builder --chown=nextjs:nodejs /app/.next/static .next/static

COPY --from=builder --chown=nextjs:nodejs /app/public public
COPY --from=builder --chown=nextjs:nodejs /app/scripts scripts
COPY --from=builder --chown=nextjs:nodejs /app/prisma prisma

RUN npm i -g prisma \
  && npm cache clean --force

USER nextjs

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

EXPOSE 3000

ENTRYPOINT [ "/app/scripts/entrypoint.sh" ]
