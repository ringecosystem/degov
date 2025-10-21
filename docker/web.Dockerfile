## reference: https://github.com/vercel/next.js/blob/canary/examples/with-docker/Dockerfile

FROM node:22-alpine AS base

FROM base AS builder

COPY . /code

ENV DEGOV_CONFIG_PATH=/code/degov.yml

RUN corepack enable pnpm \
  && cd /code \
  && pnpm install --frozen-lockfile \
  && cd /code/packages/web \
  && pnpm build

FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV DEGOV_CONFIG_PATH=/app/degov.yml

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /code/packages/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /code/packages/web/.next/static ./.next/static

COPY --from=builder --chown=nextjs:nodejs /code/packages/web/public ./public
COPY --from=builder --chown=nextjs:nodejs /code/packages/web/scripts ./scripts
COPY --from=builder --chown=nextjs:nodejs /code/packages/web/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /code/degov.yml ./degov.yml

RUN npm i -g prisma \
  && npm cache clean --force

USER nextjs

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

EXPOSE 3000

ENTRYPOINT [ "/app/scripts/entrypoint.sh" ]
