## reference: https://github.com/vercel/next.js/blob/canary/examples/with-docker/Dockerfile

FROM node:22-alpine AS base

FROM base AS builder

COPY . /code

ENV DEGOV_CONFIG_PATH=/app/degov.yml
ENV CI=true

RUN apk add --no-cache python3 make g++ \
    && corepack enable pnpm \
    && mv /code/packages/web /app \
    && mv /code/degov.yml /app \
    && rm -rf /code \
    && cd /app \
    && echo "node-linker=hoisted" > .npmrc \
    && pnpm install --frozen-lockfile \
    && npx prisma generate \
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
COPY --from=builder --chown=nextjs:nodejs /app/prisma.config.ts prisma.config.ts

# Prisma generated client (query engine binary)
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma

# Prisma packages (client, engines, etc.)
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma

# Prisma CLI — required by entrypoint.sh for 'npx prisma migrate deploy'
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.bin/prisma ./node_modules/.bin/prisma

USER nextjs

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

EXPOSE 3000

ENTRYPOINT [ "/app/scripts/entrypoint.sh" ]
