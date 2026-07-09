FROM oven/bun:1-debian AS base
WORKDIR /app

FROM base AS deps
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile --ignore-scripts

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN bunx nuxt prepare
RUN bunx prisma generate
RUN node --disable-warning=DEP0155 ./node_modules/nuxt/bin/nuxt.mjs build

FROM base AS runner
ARG GIT_COMMIT_HASH=""
ENV NODE_ENV=production
ENV TZ=Europe/Prague
ENV NUXT_PUBLIC_GIT_COMMIT_HASH=$GIT_COMMIT_HASH
COPY --from=builder /app/.output ./.output
COPY --from=builder /app/node_modules/openai ./.output/server/node_modules/openai
RUN apt-get update \
    && apt-get install -y --no-install-recommends procps \
    && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/config ./config
COPY --from=builder /app/prisma ./prisma
COPY scripts ./scripts
RUN chmod +x ./scripts/entrypoint.sh
EXPOSE 3000
CMD ["./scripts/entrypoint.sh"]
