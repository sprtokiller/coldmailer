import { prisma } from '~/server/utils/prisma'

// ── Types ────────────────────────────────────────────────────────────────────

export interface TrackAIOptions {
  userId: string
  model: string
  costUsd: number
  generationId?: string | null
  pipelineStepId?: string
  stepType?: string
}

export interface TrackSerpOptions {
  userId: string
  pipelineStepId?: string
  stepType?: string
}

// ── Reset helpers ─────────────────────────────────────────────────────────────

function getNextResetDate(from: Date, period: string): Date | null {
  const d = new Date(from)
  switch (period) {
    case 'daily':   d.setDate(d.getDate() + 1);   break
    case 'weekly':  d.setDate(d.getDate() + 7);   break
    case 'monthly': d.setMonth(d.getMonth() + 1); break
    default: return null // 'never'
  }
  return d
}

/**
 * Checks whether the current billing window has expired and resets usedUsd
 * if so. Called lazily before every budget enforcement check and cost increment.
 *
 * Returns the up-to-date budget record (or null if none exists).
 */
export async function maybeResetBudget(userId: string) {
  const budget = await prisma.userBudget.findUnique({ where: { userId } })
  if (!budget || budget.resetPeriod === 'never' || !budget.periodStartAt) return budget

  const nextReset = getNextResetDate(budget.periodStartAt, budget.resetPeriod)
  if (!nextReset || new Date() < nextReset) return budget

  // Atomic conditional update — only resets if periodStartAt hasn't changed (CAS pattern)
  await prisma.userBudget.updateMany({
    where: { userId, periodStartAt: budget.periodStartAt },
    data: { usedUsd: 0, periodStartAt: new Date() },
  })

  return prisma.userBudget.findUnique({ where: { userId } })
}

// ── Cost enforcement ──────────────────────────────────────────────────────────

/**
 * Returns true if the user has exceeded their limit.
 * Also handles lazy period reset.
 */
export async function isOverBudget(userId: string): Promise<{ over: boolean; limitUsd: number | null }> {
  const budget = await maybeResetBudget(userId)
  if (!budget || budget.limitUsd == null) return { over: false, limitUsd: null }
  return { over: budget.usedUsd >= budget.limitUsd, limitUsd: budget.limitUsd }
}

// ── Tracking ──────────────────────────────────────────────────────────────────

/**
 * Records an AI completion event and increments the user's usedUsd counter.
 * Non-fatal — errors are swallowed so pipeline never breaks.
 */
export async function trackAIUsage(opts: TrackAIOptions): Promise<void> {
  try {
    const cost = Math.max(0, opts.costUsd)
    await prisma.$transaction(async (tx) => {
      await tx.usageEvent.create({
        data: {
          userId:         opts.userId,
          eventType:      'ai_completion',
          model:          opts.model,
          costUsd:        cost,
          generationId:   opts.generationId ?? null,
          pipelineStepId: opts.pipelineStepId ?? null,
          stepType:       opts.stepType ?? null,
        },
      })
      if (cost > 0) {
        await tx.userBudget.upsert({
          where:  { userId: opts.userId },
          create: { userId: opts.userId, usedUsd: cost },
          update: { usedUsd: { increment: cost } },
        })
      }
    })
  } catch (err) {
    console.error('[usage-tracker] trackAIUsage error:', err)
  }
}

/**
 * Records a SerpAPI search event (no monetary cost tracked here, count only).
 * Non-fatal.
 */
export async function trackSerpUsage(opts: TrackSerpOptions): Promise<void> {
  try {
    await prisma.usageEvent.create({
      data: {
        userId:         opts.userId,
        eventType:      'serp_search',
        model:          'serpapi',
        costUsd:        0,
        pipelineStepId: opts.pipelineStepId ?? null,
        stepType:       opts.stepType ?? null,
      },
    })
  } catch (err) {
    console.error('[usage-tracker] trackSerpUsage error:', err)
  }
}

// ── System config helpers ─────────────────────────────────────────────────────

export interface DefaultBudgetConfig {
  limitUsd: number | null
  resetPeriod: 'never' | 'daily' | 'weekly' | 'monthly'
}

const DEFAULT_BUDGET_KEY = 'budget.default'

export async function getDefaultBudgetConfig(): Promise<DefaultBudgetConfig> {
  const row = await prisma.systemConfig.findUnique({ where: { key: DEFAULT_BUDGET_KEY } })
  if (!row) return { limitUsd: null, resetPeriod: 'never' }
  const v = row.value as Partial<DefaultBudgetConfig>
  return {
    limitUsd:    v.limitUsd    ?? null,
    resetPeriod: v.resetPeriod ?? 'never',
  }
}

export async function setDefaultBudgetConfig(
  cfg: DefaultBudgetConfig,
  updatedBy?: string,
): Promise<void> {
  await prisma.systemConfig.upsert({
    where:  { key: DEFAULT_BUDGET_KEY },
    create: { key: DEFAULT_BUDGET_KEY, value: cfg as never, updatedBy: updatedBy ?? null },
    update: { value: cfg as never, updatedBy: updatedBy ?? null },
  })
}

/**
 * Applies the system default budget to a newly registered user (if not set).
 */
export async function applyDefaultBudgetToUser(userId: string): Promise<void> {
  const existing = await prisma.userBudget.findUnique({ where: { userId } })
  if (existing) return

  const cfg = await getDefaultBudgetConfig()
  if (cfg.limitUsd == null && cfg.resetPeriod === 'never') return // nothing to apply

  await prisma.userBudget.create({
    data: {
      userId,
      limitUsd:     cfg.limitUsd,
      usedUsd:      0,
      resetPeriod:  cfg.resetPeriod,
      periodStartAt: cfg.resetPeriod !== 'never' ? new Date() : null,
    },
  })
}
