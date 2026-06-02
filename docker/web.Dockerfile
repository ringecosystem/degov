## reference: https://github.com/vercel/next.js/blob/canary/examples/with-docker/Dockerfile

FROM node:22-alpine AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable \
    && corepack prepare pnpm@10.32.1 --activate

FROM base AS builder
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/package.json

ENV DEGOV_CONFIG_PATH=/app/degov.yml
ENV CI=true

RUN apk add --no-cache python3 make g++ \
    && echo "node-linker=hoisted" > .npmrc \
    && pnpm install --filter @degov/web... --frozen-lockfile --ignore-scripts

COPY degov.yml degov.yml
COPY docker/copy-prisma-runtime.cjs docker/copy-prisma-runtime.cjs
COPY apps/web apps/web

WORKDIR /app/apps/web

RUN pnpm exec prisma generate \
    && pnpm run build

RUN node /app/docker/copy-prisma-runtime.cjs

FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV DEGOV_CONFIG_PATH=/app/degov.yml

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/degov.yml degov.yml
# Standalone output keeps the workspace layout, including apps/web/server.js.
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone .
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static apps/web/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/public apps/web/public
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/scripts apps/web/scripts
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/prisma apps/web/prisma
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/prisma.config.ts apps/web/prisma.config.ts

# Runtime Prisma support for entrypoint.sh without copying the full install tree.
COPY --from=builder --chown=nextjs:nodejs /app/prisma-runtime/node_modules node_modules

USER nextjs

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

EXPOSE 3000

ENTRYPOINT [ "/app/apps/web/scripts/entrypoint.sh" ]
