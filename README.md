# ColdMailer

AI-powered cold outreach pipeline for identifying and contacting event/competition sponsors. Runs a 6-step pipeline from market scanning through Gmail draft creation.

## Prerequisites

- [Bun](https://bun.sh/) ≥ 1.1
- [Docker](https://www.docker.com/) (for the local PostgreSQL instance)
- A Google Cloud project with OAuth 2.0 credentials and the **Gmail API** enabled
- An [OpenRouter](https://openrouter.ai/) account (inference key)
- A [SerpAPI](https://serpapi.com/) key

## Quick start

```bash
# 1. Install dependencies (also runs nuxt prepare + prisma generate)
bun install

# 2. install playwright browser
npx playwright install --with-deps

# 3. Set up environment
cp .env.example .env
# → fill in values (see below)

# 4. Start the database
docker compose up db -d

# 5. Push the schema to the database
bun run db:push

# 6. Seed system prompts
bun run db:seed

# 7. Start the dev server
bun run dev
# → http://localhost:3000
```

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `GOOGLE_CLIENT_ID` | yes | Google OAuth 2.0 client ID |
| `GOOGLE_CLIENT_SECRET` | yes | Google OAuth 2.0 client secret |
| `GOOGLE_REDIRECT_URI` | yes | Must match Google Cloud Console exactly; default `http://localhost:3000/api/auth/callback/google` |
| `DATABASE_URL` | yes | PostgreSQL URL; `postgresql://coldmailer:coldmailer@localhost:5432/coldmailer` matches Docker defaults |
| `NUXT_SESSION_PASSWORD` | yes | Session encryption key, min 32 chars — `openssl rand -base64 32` |
| `OPEN_ROUTER_API_KEY` | yes | OpenRouter inference key — all AI calls go through OpenRouter |
| `OPEN_ROUTER_MANAGEMENT_KEY` | no | OpenRouter management key for usage/cost tracking |
| `SERPAPI_KEYS` | yes | Comma-separated SerpAPI keys rotated Round Robin in the `PARTNER_IDENTIFICATION` step (e.g. `key1,key2,key3`) |

### Google Cloud Console setup

1. Create an OAuth 2.0 client (type: **Web application**)
2. Add the redirect URI: `http://localhost:3000/api/auth/callback/google`
3. Enable the **Gmail API** on the project
4. Required OAuth scope: `https://www.googleapis.com/auth/gmail.compose`
5. Only `@scg.cz` accounts can sign in (enforced in `/api/auth/callback/google`)

## Database commands

```bash
bun run db:push      # apply schema changes — USE THIS, not db:migrate
bun run db:migrate   # WARNING: can prompt to reset/wipe the DB if drift is detected
bun run db:seed      # (re)seed system prompts from prisma/system-prompts/*.txt
bun run db:studio    # open Prisma Studio at http://localhost:5555
```

`db:push` is idempotent and safe to re-run. `db:migrate` should only be used deliberately — it can wipe data if schema drift is detected.

`db:seed` is also safe to re-run: it upserts existing system prompts rather than duplicating them.

## Docker

`docker-compose.yml` provides a local Postgres 16 instance and an optional `db-backup` sidecar:

```bash
docker compose up db -d          # just the database
docker compose up                # database + app container (production image)
```

Database credentials in the Docker setup: user `coldmailer`, password `coldmailer`, database `coldmailer`.

## Development commands

```bash
bun run dev       # dev server on port 3000 with HMR
bun run build     # production build
bun run preview   # serve the production build locally
```

## Pipeline overview

The app runs a 6-step sequential pipeline. Each step's output feeds the next.

| # | Step | Model / Mechanism | Notes |
|---|---|---|---|
| 1 | `MARKET_SCANNING` | `openai/o4-mini-deep-research` | Live web search, streaming |
| 2 | `PARTNER_IDENTIFICATION` | SerpAPI + Playwright + Claude | Async generator, deduped into DB |
| 3 | `PARTNER_PROFILING` | `openai/o4-mini-deep-research` | Per-partner, includes contact discovery |
| 4 | `VALUE_ALIGNMENT` | `anthropic/claude-sonnet-4-5` | Streaming, adaptive reasoning |
| 5 | `OUTREACH_PREPARATION` | `anthropic/claude-sonnet-4-5` | Streaming, adaptive reasoning |
| 6 | `OUTREACH_EXECUTION` | Gmail API | Creates a Gmail draft, no AI call |

Model/step mappings: [`config/pipeline.ts`](config/pipeline.ts)

## Library

The `/library` page manages reusable assets used to configure pipeline steps:

- **System prompts** — per-step LLM instructions; seeded by `prisma/seed.ts`
- **Context parts** — reusable text blocks injected into prompts
- **Selling points** — value propositions sent to the alignment step
- **Email drafts** — outreach templates for `OUTREACH_PREPARATION`

All assets support a lineage tree (`derivedFromId`) for tracking customisation history.

## Auth

Authentication uses manual Google OAuth restricted to `@scg.cz` accounts. Tokens (access + refresh) are stored on the `User` row. The session cookie is managed by `nuxt-auth-utils` and encrypted with `NUXT_SESSION_PASSWORD`.
