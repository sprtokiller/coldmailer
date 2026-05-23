# CLAUDE.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

## Commands

```bash
# Development
bun run dev          # start dev server (port 3000)
bun run build        # production build
bun run preview      # preview production build

# Database
bun run db:push      # push schema to DB without migration — USE THIS for schema changes
bun run db:migrate   # create and apply a migration — WARNING: can prompt to reset DB and wipe all data if schema drift detected; never instruct user to run this without explicit confirmation
bun run db:seed      # seed system prompts (bun prisma/seed.ts)
bun run db:studio    # open Prisma Studio
```

After `bun install`, `postinstall` runs `nuxt prepare && prisma generate` automatically.

## Environment Variables

Copy `.env.example` to `.env` and fill in:
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — Google OAuth 2.0 credentials (only `@scg.cz` emails are allowed to sign in)
- `GOOGLE_REDIRECT_URI` — defaults to `http://localhost:3000/api/auth/callback/google`; must match exactly what's registered in Google Cloud Console; requires scope `gmail.compose`
- `DATABASE_URL` — PostgreSQL connection string, e.g. `postgresql://coldmailer:coldmailer@localhost:5432/coldmailer` (matches `docker-compose.yml` defaults)
- `NUXT_SESSION_PASSWORD` — session encryption key, min 32 chars; generate with `openssl rand -base64 32`
- `OPEN_ROUTER_API_KEY` — OpenRouter inference key (all AI calls go through OpenRouter, not direct Anthropic/OpenAI)
- `OPEN_ROUTER_MANAGEMENT_KEY` — OpenRouter management key for usage/cost tracking (optional for local dev)
- `SERPAPI_KEY` — SerpAPI key for Google search in the `PARTNER_IDENTIFICATION` step

## Architecture

### Tech Stack
- **Runtime**: Bun ≥ 1.1, Nuxt 3
- **Database**: PostgreSQL via Prisma 5
- **Auth**: Manual Google OAuth — restricted to `@scg.cz` domain; tokens (access + refresh) are stored in the `User` row and the session cookie is managed by `nuxt-auth-utils`
- **AI**: All LLM calls go through OpenRouter via the `openai` npm package (`baseURL: 'https://openrouter.ai/api/v1'`). There is no direct Anthropic SDK.
- **Web scraping**: SerpAPI (Google search) + Crawlee/Playwright for fetching pages
- **Styling**: Tailwind CSS + Parkinsans Google Font

### Pipeline Model
The app's core concept is a multi-step outreach pipeline stored as `PipelineRun` → `PipelineStep[]` in the DB. Steps run sequentially; output from one step is fed as input to the next.

| Step | Model | Mechanism |
|---|---|---|
| `MARKET_SCANNING` | `openai/o4-mini-deep-research` | Streaming AI |
| `PARTNER_IDENTIFICATION` | SerpAPI + Playwright + Claude Sonnet | `runPartnerIdentification()` generator |
| `PARTNER_PROFILING` | `openai/o4-mini-deep-research` | Streaming AI, one partner at a time; includes contact discovery |
| `VALUE_ALIGNMENT` | `anthropic/claude-sonnet-4-5` | Streaming AI |
| `OUTREACH_PREPARATION` | `anthropic/claude-sonnet-4-5` | Streaming AI |
| `OUTREACH_EXECUTION` | Gmail API | Creates a Gmail draft directly |

All model/step mappings live in [`config/pipeline.ts`](config/pipeline.ts) — `STEP_MODEL`, `MODELS`, `MODEL_BADGE`, `STEP_SYSTEM_PROMPTS`.

### Key Server Files
- [`server/api/pipeline/[id]/steps/execute.post.ts`](server/api/pipeline/%5Bid%5D/steps/execute.post.ts) — main step execution endpoint; streams SSE (`data: <json>\n\n`). Handles special cases for `PARTNER_IDENTIFICATION`, `PARTNER_PROFILING`, and `OUTREACH_EXECUTION`.
- [`server/utils/partner-identification.ts`](server/utils/partner-identification.ts) — async generator that runs the SerpAPI → Playwright → AI extraction → DB dedup pipeline for step 2.
- [`server/utils/ai.ts`](server/utils/ai.ts) — `streamStepAI()` generator; adds adaptive reasoning (`reasoning: { enabled: true, effort: 'high' }`) for Anthropic models via OpenRouter.
- [`server/utils/google.ts`](server/utils/google.ts) — Google OAuth token exchange, token refresh, and Gmail draft creation.
- [`server/api/pipeline/[id]/steps/import-ai.post.ts`](server/api/pipeline/%5Bid%5D/steps/import-ai.post.ts) — parses free-text/deep-research output into structured JSON and merges it into an existing step's `outputData`. Contains JSON repair logic and smart merging (dedup by name/URL/email).

### Key Client Files
- [`composables/usePipelineRunPage.ts`](composables/usePipelineRunPage.ts) — single large composable that owns all pipeline page state and logic. Provided via `provide(pipelineRunKey, pipeline)` from the page and injected in child components.
- [`components/pipeline/PipelineStepCard.vue`](components/pipeline/PipelineStepCard.vue) — accordion card per step; renders config + result sub-components.
- [`components/pipeline/PipelineStepConfig.vue`](components/pipeline/PipelineStepConfig.vue) — step configuration UI (prompt selection, context parts, manual context, input data editor).
- [`components/pipeline/PipelineStepResult.vue`](components/pipeline/PipelineStepResult.vue) — streaming output display, table/JSON/raw view modes, inline edit, AI import.

### Library
The `/library` page manages reusable assets: `SystemPrompt`, `ContextPart`, `SellingPoint`, and `EmailDraft`. All support a lineage tree (`derivedFromId`). System prompts are seeded by `prisma/seed.ts` with `isSystem: true`; step execution falls back to them when no custom prompt is selected.

### Auth Flow
1. `/login` → `/api/auth/login` → Google consent screen
2. `/api/auth/callback/google` validates `@scg.cz` domain, upserts `User`, sets session
3. `middleware/auth.ts` redirects unauthenticated users to `/login`
4. `server/utils/requireAuth.ts` guards all API routes

### Data Patterns
- Step `outputData` is always JSON stored in a `Json` Prisma column. Most steps return a JSON array (the AI is instructed to always return arrays). `PARTNER_PROFILING` returns `Array<PartnerProfile>`.
- `PARTNER_IDENTIFICATION` output shape: `{ items: Array<{ itemName, partners: [{ partnerId, name, isNew }] }> }`.
- `parseAIOutput()` in `execute.post.ts` and the more robust version in `import-ai.post.ts` both strip markdown fences and fall back to `{ raw: text }` if JSON parsing fails.
- Adaptive reasoning is only enabled for models whose ID starts with `anthropic/` (checked in `streamStepAI`).
