import { prisma } from '~/server/utils/prisma'
import { requireAdmin } from '~/server/utils/permissions'
import { REASONING_STEP_TYPES, REASONING_EFFORT_LEVELS, DEFAULT_REASONING_EFFORT, type ReasoningEffort, type ReasoningStepType } from '~/config/pipeline'

const CONFIG_KEY = 'ai.reasoningEffort'

export default defineEventHandler(async (event) => {
  const session = await requireAdmin(event)
  const body = await readBody<{ effort: Partial<Record<ReasoningStepType, ReasoningEffort>> }>(event)

  const effort = {} as Record<ReasoningStepType, ReasoningEffort>
  for (const stepType of REASONING_STEP_TYPES) {
    const value = body.effort?.[stepType]
    if (value && !(REASONING_EFFORT_LEVELS as readonly string[]).includes(value)) {
      throw createError({ statusCode: 400, message: `Neplatná hodnota reasoning effort pro ${stepType}: ${value}` })
    }
    effort[stepType] = value ?? DEFAULT_REASONING_EFFORT[stepType]
  }

  await prisma.systemConfig.upsert({
    where: { key: CONFIG_KEY },
    create: { key: CONFIG_KEY, value: effort as never, updatedBy: session.id },
    update: { value: effort as never, updatedBy: session.id },
  })

  return { effort }
})
