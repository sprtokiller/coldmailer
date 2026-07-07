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
- `NUXT_GOOGLE_CLIENT_ID` / `NUXT_GOOGLE_CLIENT_SECRET` — Google OAuth 2.0 credentials (only `@scg.cz` emails are allowed to sign in)
- `NUXT_GOOGLE_REDIRECT_URI` — defaults to `http://localhost:3000/api/auth/callback/google`; must match exactly what's registered in Google Cloud Console; requires scopes `gmail.compose` and `gmail.readonly` (see `SCOPES` in `server/utils/google.ts`)
- `NUXT_ADMIN_EMAILS` — comma-separated emails granted admin access on login (and pre-seeded as admins)
- `DATABASE_URL` — PostgreSQL connection string, e.g. `postgresql://coldmailer:coldmailer@localhost:5432/coldmailer` (matches `docker-compose.yml` defaults)
- `NUXT_SESSION_PASSWORD` — session encryption key, min 32 chars; generate with `openssl rand -base64 32`
- `NUXT_OPEN_ROUTER_API_KEY` — OpenRouter inference key (all AI calls go through OpenRouter, not direct Anthropic/OpenAI)
- `NUXT_OPEN_ROUTER_MANAGEMENT_KEY` — OpenRouter management key for usage/cost tracking (optional for local dev)

## Safe Schema Changes (don't break prod)

Production's `scripts/entrypoint.sh` runs `prisma db push --skip-generate` on **every container boot** — deliberately **without** `--accept-data-loss`. History: that flag was added on 2026-07-04 (`4830074`) to stop a crash-loop when a column drop needed confirmation Prisma couldn't get non-interactively, then removed again the same day (`9b9cad7`) because an unconditional flag in prod would silently let *any* future destructive change (including an accidental one) wipe data with no human ever seeing the warning. **Do not re-add `--accept-data-loss` to `entrypoint.sh`.**

What this means for a schema change:
- **Additive changes** (new nullable column, new table) are always safe — `db push` applies them with zero confirmation needed. Nothing else to do.
- **Destructive-looking changes** (renamed/dropped table or column, new non-nullable column without a default, type change) make `db push` refuse and exit non-zero → container crash-loops → deploy fails at the health check. This fails *safe* (no data loss, just a failed deploy), but still blocks the release.
- The fix is a hand-written, idempotent backfill SQL script in `scripts/`, run from `entrypoint.sh` *before* the `db push` line — see `scripts/backfill-negotiation-split.sql` for the reference pattern (it renamed `ProjectRecord`→`Negotiation` preserving data/ids, copied `Interaction` rows into the new `Email`/`Note` tables, then dropped the old tables itself). By the time `db push` runs, Prisma sees no destructive diff left to confirm.
- Guard the script so it's a no-op after it has run once — `entrypoint.sh` executes it on *every* boot, not just the first. The reference script checks `IF NOT EXISTS ("Interaction" table) THEN RETURN;` at the top for exactly this reason.
- Wire the new script into `entrypoint.sh` the same way the two existing ones are (`if [ -f scripts/your-script.sql ]; then ... fi`, before `db push`).

Local dev note: `bun run db:push` calls `prisma db push` directly and does **not** run these backfill scripts (those only execute inside `entrypoint.sh`, i.e. in Docker) — so a local dev DB can drift from what production actually has. If local `db push` demands `--accept-data-loss`, treat that as a signal prod will need a backfill script too, not just something to wave through locally. Only pass `--accept-data-loss` locally when the data is genuinely disposable dev data, and never as "the fix" for production.

## Architecture

### Tech Stack
- **Runtime**: Bun ≥ 1.1, Nuxt 3
- **Database**: PostgreSQL via Prisma 5
- **Auth**: Manual Google OAuth — restricted to `@scg.cz` domain; tokens (access + refresh) are stored in the `User` row and the session cookie is managed by `nuxt-auth-utils`
- **AI**: All LLM calls go through OpenRouter via the `openai` npm package (`baseURL: 'https://openrouter.ai/api/v1'`). There is no direct Anthropic SDK.
- **Styling**: Tailwind CSS + Parkinsans Google Font

There is no `PipelineRun`/`PipelineStep` model and no visual pipeline canvas anymore — that sequential-pipeline design was replaced by the Groups → Projects structure described below. `StepType` (`MARKET_SCANNING`, `PARTNER_IDENTIFICATION`, `PARTNER_PROFILING`, `VALUE_ALIGNMENT`, `OUTREACH_PREPARATION`) survives only as a label on `SystemPrompt`/`ContextPart` for organizing the Library; only `VALUE_ALIGNMENT` and `OUTREACH_PREPARATION` are wired to an actual AI call. `server/utils/serpapi.ts` and `server/utils/page-fetcher.ts` (its Crawlee/Playwright counterpart), both leftovers from the removed `PARTNER_IDENTIFICATION` step, were removed along with the `playwright`/`crawlee`/`@crawlee/memory-storage` dependencies they solely justified. `@vue-flow/core` (leftover from the removed visual pipeline canvas) and `pathe` (unused) were removed too.

### Data Model
Work is organized as **Groups → Projects** (`prisma/schema.prisma`). Each project tracks partner/sponsor records via a shared `GlobalRecord` table (deduplicated across projects), with per-project state layered on top:

- `GlobalRecord` — canonical partner/competition/etc. record (`RecordType` enum), shared across projects; dedup via `normalizedName`+`type` and Jaro-Winkler matching in `server/utils/deduplication.ts`.
- `ProjectRecord` — per-project state for a `GlobalRecord` (negotiation status, contact blacklist, address overrides).
- `PartnerAlignment` / `PartnerOutreachDraft` — per-project, per-record output of the `VALUE_ALIGNMENT` / `OUTREACH_PREPARATION` AI calls (replaces the old `PipelineStep.outputData` storage).
- `OutreachAssignment` / `NegotiationAssignee` — who owns outreach vs. who owns the negotiation for a record (independent, can differ).
- `Interaction` — notes, Gmail-synced emails, and fulfillment entries logged against a record within a project.
- `ScheduledEmail` — emails queued for a future send, polled by a background sender (independent of the immediate-send undo/grace-period flow).
- `SystemPrompt` / `ContextPart` / `SellingPoint` / `EmailDraft` / `Signature` — reusable Library assets, scoped to a `Group`/`Project` or global, with a lineage tree via `derivedFromId`.
- `UserBudget` / `UsageEvent` — per-user AI/SerpAPI spend tracking and optional budget caps, reset on `BudgetResetPeriod`.
- `ProjectRole` / `UserProjectRole` — per-project permission roles (see `server/utils/projectPermissions.ts`); `User.isAdmin` grants global admin access (see `server/utils/permissions.ts`).

### Key Server Files
- [`server/api/projects/[projectId]/outreach/[globalRecordId]/alignment.post.ts`](server/api/projects/%5BprojectId%5D/outreach/%5BglobalRecordId%5D/alignment.post.ts) — runs `VALUE_ALIGNMENT` for one partner and stores the result on `PartnerAlignment`.
- [`server/api/projects/[projectId]/outreach/[globalRecordId]/draft.post.ts`](server/api/projects/%5BprojectId%5D/outreach/%5BglobalRecordId%5D/draft.post.ts) — runs `OUTREACH_PREPARATION` from a saved alignment and stores the result on `PartnerOutreachDraft`.
- [`server/api/projects/[projectId]/outreach/[globalRecordId]/save.post.ts`](server/api/projects/%5BprojectId%5D/outreach/%5BglobalRecordId%5D/save.post.ts), `send.post.ts`, `cancel-send.post.ts`, `claim.post.ts` / `unclaim.post.ts` / `assign.post.ts` — draft persistence, Gmail send (with cancel grace period), and outreach ownership.
- [`server/utils/ai.ts`](server/utils/ai.ts) — `streamStepAI()` generator; always calls `MODELS.CLAUDE_SONNET` via OpenRouter, with adaptive reasoning effort (configurable per step via `SystemConfig`, `anthropic/`-prefixed models only).
- [`server/utils/google.ts`](server/utils/google.ts) — Google OAuth token exchange, token refresh, and Gmail draft/send.
- [`server/utils/gmail-sync.ts`](server/utils/gmail-sync.ts) / [`server/api/gmail/sync.post.ts`](server/api/gmail/sync.post.ts) — syncs Gmail thread state into `Interaction` rows.
- [`server/utils/global-record.ts`](server/utils/global-record.ts) / [`server/utils/deduplication.ts`](server/utils/deduplication.ts) — `GlobalRecord` payload updates and fuzzy-match dedup (Jaro-Winkler).
- [`server/utils/record-events.ts`](server/utils/record-events.ts) — appends audit entries (`RecordEvent`) for changes to a `GlobalRecord`.
- [`server/utils/permissions.ts`](server/utils/permissions.ts) — `requireAdmin()` and scope-access helpers; [`server/utils/projectPermissions.ts`](server/utils/projectPermissions.ts) — per-project role/permission checks.
- [`server/utils/outreach-scheduler.ts`](server/utils/outreach-scheduler.ts) — in-memory timer map for `ScheduledEmail` sends and immediate-send cancellation.
- [`server/utils/job-registry.ts`](server/utils/job-registry.ts) — `AbortController` registry so long-running AI calls can be cancelled by id.
- [`server/utils/parse-ai-output.ts`](server/utils/parse-ai-output.ts) — shared JSON parsing helper (strips markdown fences, falls back to `{ raw: text }`).

### Key Client Files
- [`composables/useProjectOutreach.ts`](composables/useProjectOutreach.ts) — state and actions for the `/outreach` workspace (partner list, alignment/draft triggers, assignment).
- [`composables/useActiveProject.ts`](composables/useActiveProject.ts) — tracks the currently selected project/group across pages.
- [`composables/useGmailSync.ts`](composables/useGmailSync.ts) — polls `/api/gmail/sync` and exposes sync state.
- [`composables/useSendNotifications.ts`](composables/useSendNotifications.ts) — countdown/undo UI state for the send grace period.
- [`composables/useToast.ts`](composables/useToast.ts) — global toast notifications.
- [`components/outreach/`](components/outreach) — `AlignmentPanel.vue`, `EmailPanel.vue`, `PartnerSidebar.vue`, `ClaimPanel.vue` for the outreach workspace.
- [`components/negotiations/EmailComposer.vue`](components/negotiations/EmailComposer.vue) — composing replies/notes from the negotiation detail page.
- [`components/settings/`](components/settings) — admin panels (`SettingsUsers.vue`, `SettingsProjects.vue`, `SettingsPermissions.vue`, `SettingsBudget.vue`, `SettingsSystem.vue`, `SettingsSignatures.vue`).

### Pages
- `/outreach`, `/outreach/[id]` — outreach workspace: alignment + draft generation, claim/assign, send/schedule.
- `/negotiations`, `/negotiations/[id]` — negotiation status board and per-record interaction log.
- `/partners` — global `GlobalRecord` browser/CRM across all projects.
- `/library` — reusable Library assets (see below).
- `/settings` — current user's usage/credits; admin sections (users, groups/projects, roles, budgets) when `isAdmin`.
- `/` redirects to `/outreach`.

### Library
The `/library` page manages reusable assets: `SystemPrompt`, `ContextPart`, `SellingPoint`, `EmailDraft`, and `Signature`. All (except `Signature`) support a lineage tree (`derivedFromId`). System prompts are seeded by `prisma/seed.ts` with `isSystem: true`; the alignment/draft AI calls fall back to them when no custom prompt is selected.

### Auth Flow
1. `/login` → `/api/auth/login` → Google consent screen
2. `/api/auth/callback/google` validates `@scg.cz` domain, upserts `User`, sets session
3. `middleware/auth.ts` redirects unauthenticated users to `/login`
4. `server/utils/requireAuth.ts` guards all API routes
5. `server/middleware/project-access.ts` enforces project-scoped access for project-nested routes

### Data Patterns
- `GlobalRecord.payload` is a `Json` column holding the record's structured data (schema varies by `RecordType`); status-style fields (e.g. `relevanceStatus`) live inside it rather than as columns.
- `PartnerAlignment.outputData` and `PartnerOutreachDraft` fields hold the raw AI output for `VALUE_ALIGNMENT`/`OUTREACH_PREPARATION`, validated against `STEP_OUTPUT_SCHEMAS` in `config/pipeline.ts`.
- `parseAIOutput()` / `parse-ai-output.ts` strips markdown fences and falls back to `{ raw: text }` if JSON parsing fails.
- Adaptive reasoning is only enabled for models whose ID starts with `anthropic/` (checked in `streamStepAI`); effort level is configurable per step type via `SystemConfig` key `ai.reasoningEffort`, falling back to `DEFAULT_REASONING_EFFORT` in `config/pipeline.ts`.
