# ColdMailer

AI-assisted partner CRM and outreach tool. Organizes partners/sponsors as records inside Projects (grouped under Groups), helps draft and send personalized cold emails via Gmail, and tracks negotiation status through to fulfillment.

## Prerequisites

- [Bun](https://bun.sh/) ≥ 1.1
- [Docker](https://www.docker.com/) (for the local PostgreSQL instance)
- A Google Cloud project with OAuth 2.0 credentials and the **Gmail API** enabled
- An [OpenRouter](https://openrouter.ai/) account (inference key)

## Quick start

```bash
# 1. Install dependencies (also runs nuxt prepare + prisma generate)
bun install

# 2. Set up environment
cp .env.example .env
# → fill in values (see below)

# 3. Start the database
docker compose up db -d

# 4. Push the schema to the database
bun run db:push

# 5. Seed system prompts
bun run db:seed

# 6. Start the dev server
bun run dev
# → http://localhost:3000
```

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `NUXT_GOOGLE_CLIENT_ID` | yes | Google OAuth 2.0 client ID |
| `NUXT_GOOGLE_CLIENT_SECRET` | yes | Google OAuth 2.0 client secret |
| `NUXT_GOOGLE_REDIRECT_URI` | yes | Must match Google Cloud Console exactly; default `http://localhost:3000/api/auth/callback/google` |
| `NUXT_ADMIN_EMAILS` | no | Comma-separated emails granted admin access on login (and pre-seeded as admins) |
| `DATABASE_URL` | yes | PostgreSQL URL; `postgresql://coldmailer:coldmailer@localhost:5432/coldmailer` matches Docker defaults |
| `NUXT_SESSION_PASSWORD` | yes | Session encryption key, min 32 chars — `openssl rand -base64 32` |
| `NUXT_OPEN_ROUTER_API_KEY` | yes | OpenRouter inference key — all AI calls go through OpenRouter |
| `NUXT_OPEN_ROUTER_MANAGEMENT_KEY` | no | OpenRouter management key for usage/cost tracking |
| `NUXT_SERP_API_KEYS` | no | Comma-separated SerpAPI keys; not read by any currently active feature |

### Google Cloud Console setup

1. Create an OAuth 2.0 client (type: **Web application**)
2. Add the redirect URI: `http://localhost:3000/api/auth/callback/google`
3. Enable the **Gmail API** on the project
4. Required OAuth scopes: `https://www.googleapis.com/auth/gmail.compose` and `https://www.googleapis.com/auth/gmail.readonly` (see `SCOPES` in `server/utils/google.ts`)
5. Only `@scg.cz` accounts can sign in (enforced in `/api/auth/callback/google`)

## Database commands

```bash
bun run db:push       # apply schema changes — USE THIS, not db:migrate
bun run db:migrate    # WARNING: can prompt to reset/wipe the DB if drift is detected
bun run db:seed       # (re)seed system prompts from prisma/system-prompts/*.txt
bun run db:backfill   # one-off backfill: scripts/backfill-signature-group-id.sql
bun run db:studio     # open Prisma Studio at http://localhost:5555
bun run db:er-diagram # regenerate er-diagram.svg from the Prisma schema
```

`db:push` is idempotent and safe to re-run. `db:migrate` should only be used deliberately — it can wipe data if schema drift is detected.

`db:seed` is also safe to re-run: it upserts existing system prompts rather than duplicating them.

## Docker

Two compose files are provided:

```bash
docker compose -f docker-compose.yml up db -d       # just the database
docker compose -f docker-compose.yml up             # database + production app image

docker compose -f docker-compose-dev.yml up         # database + db-backup sidecar + dev app (HMR via `docker compose watch`)
```

`docker-compose-dev.yml` builds from `Dockerfile.dev` and syncs source changes into the container without a rebuild for most directories; `package.json` and `prisma/` changes trigger a full rebuild. It also runs a `db-backup` sidecar that dumps the database to `./backups` daily and prunes dumps older than 7 days.

Database credentials in the Docker setup: user `coldmailer`, password `coldmailer`, database `coldmailer`.

## Development commands

```bash
bun run dev         # dev server on port 3000 with HMR
bun run build       # production build
bun run preview     # serve the production build locally
bun run test        # run the test suite once (vitest)
bun run test:watch  # run tests in watch mode
```

## Architecture overview

Work is organized as **Groups → Projects**. Each project tracks a set of partner/sponsor records (`GlobalRecord`) through two parallel workflows:

- **Outreach** (`/outreach`) — for each partner, generates a strategic-fit analysis (`VALUE_ALIGNMENT`) and then a personalized draft email (`OUTREACH_PREPARATION`), both via Claude Sonnet over OpenRouter. Users can claim/assign partners, edit and save drafts, send immediately (with a short undo grace period) or schedule a send for later.
- **Negotiations** (`/negotiations`) — tracks each partner through a status pipeline (contacted → waiting → fulfilling → completed/declined) with a log of notes, emails (synced from Gmail), and fulfillment records, assignable to team members.

`/partners` is the global partner record browser/CRM across all projects. `/settings` shows the current user's AI usage/credits and, for admins, user/group/project/role and budget management.

## Library

The `/library` page manages reusable assets used to configure the AI steps above:

- **System prompts** — per-step LLM instructions; seeded by `prisma/seed.ts`. Still organized under legacy step-type labels (`MARKET_SCANNING`, `PARTNER_IDENTIFICATION`, `PARTNER_PROFILING`, `VALUE_ALIGNMENT`, `OUTREACH_PREPARATION`) from an earlier sequential-pipeline design; only `VALUE_ALIGNMENT` and `OUTREACH_PREPARATION` are currently wired to an AI call.
- **Context parts** — reusable text blocks injected into prompts
- **Selling points** — value propositions sent to the alignment step
- **Email drafts** — outreach templates for `OUTREACH_PREPARATION`
- **Signatures** — per-group sender signatures appended to sent emails

All assets support a lineage tree (`derivedFromId`) for tracking customisation history.

## Auth

Authentication uses manual Google OAuth restricted to `@scg.cz` accounts. Tokens (access + refresh) are stored on the `User` row. The session cookie is managed by `nuxt-auth-utils` and encrypted with `NUXT_SESSION_PASSWORD`.
