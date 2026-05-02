import { StepType } from '@prisma/client'
import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const { stepType } = getQuery(event)
  const requestedStepType = typeof stepType === 'string' && stepType in StepType
    ? stepType as StepType
    : undefined

  return prisma.systemPrompt.findMany({
    where: requestedStepType ? { stepType: requestedStepType } : undefined,
    include: { author: { select: { id: true, name: true, image: true } } },
    orderBy: { createdAt: 'desc' },
  })
})
