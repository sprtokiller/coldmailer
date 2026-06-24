FROM oven/bun:1-debian AS base
WORKDIR /app

FROM base AS deps
COPY package.json bun.lockb* ./
RUN bun install --frozen-lockfile --ignore-scripts

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN bunx nuxt prepare
RUN bunx prisma generate
RUN bun run build

FROM base AS runner
ENV NODE_ENV=production
RUN bunx playwright install --with-deps chromium
COPY --from=builder /app/.output ./.output
COPY --from=builder /app/node_modules/openai ./.output/server/node_modules/openai
COPY --from=builder /app/prisma ./prisma
COPY scripts/entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh
EXPOSE 3000
CMD ["./entrypoint.sh"]
