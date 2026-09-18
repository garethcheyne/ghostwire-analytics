ARG NODE_IMAGE=node:24-alpine
# Keep in sync with prisma in package.json.
ARG PRISMA_VERSION=7.10.0

FROM ${NODE_IMAGE} AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json ./
# npm install (not ci): lockfiles written by npm < 11.19 omit optional wasm deps that newer npm
# expects, which makes npm ci fail. install still uses the locked versions.
RUN npm install --no-audit --no-fund

FROM ${NODE_IMAGE} AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Only needed so prisma.config.ts loads during `prisma generate`; nothing connects at build time.
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build
ENV BETTER_AUTH_SECRET=build-time-placeholder-not-used-at-runtime
# geo/ always exists so the COPY below works even with SKIP_BUILD_GEO set.
ARG SKIP_BUILD_GEO
ENV SKIP_BUILD_GEO=$SKIP_BUILD_GEO
RUN mkdir -p geo && npm run build

FROM ${NODE_IMAGE} AS runner
ARG PRISMA_VERSION
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

# Prisma CLI for `migrate deploy` on start, kept apart from the app bundle.
WORKDIR /app/migrate
RUN npm init -y >/dev/null && npm install --omit=dev prisma@${PRISMA_VERSION} dotenv
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts

WORKDIR /app
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/geo ./geo
COPY --chown=nextjs:nodejs scripts/start-docker.sh ./start-docker.sh
# Log files (LOG_DIR), on a volume so they outlive the container.
RUN mkdir -p /app/logs && chown nextjs:nodejs /app/logs

USER nextjs
EXPOSE 3000
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

CMD ["sh", "start-docker.sh"]
