import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'
import { REASONING_STEP_TYPES, DEFAULT_REASONING_EFFORT, type ReasoningEffort, type ReasoningStepType } from '~/config/pipeline'

const CONFIG_KEY = 'ai.reasoningEffort'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const row = await prisma.systemConfig.findUnique({ where: { key: CONFIG_KEY } })
  const overrides = (row?.value as Partial<Record<ReasoningStepType, ReasoningEffort>>) ?? {}

  const effort = {} as Record<ReasoningStepType, ReasoningEffort>
  for (const stepType of REASONING_STEP_TYPES) {
    effort[stepType] = overrides[stepType] ?? DEFAULT_REASONING_EFFORT[stepType]
  }
  return { effort }
})
