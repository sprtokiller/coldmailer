import { StepType, type Prisma } from '@prisma/client'
import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'
import { getActiveGroupId } from '~/server/utils/activeGroup'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const { stepType } = getQuery(event)
  const requestedStepType = typeof stepType === 'string' && stepType in StepType
    ? stepType as StepType
    : undefined

  const groupId = await getActiveGroupId(event)

  const OR: Prisma.SystemPromptWhereInput[] = [
    { isSystem: true },
  ]
  if (groupId) OR.push({ groupId, isSystem: false })

  const baseWhere: Prisma.SystemPromptWhereInput = { OR }
  if (requestedStepType) baseWhere.stepType = requestedStepType

  return prisma.systemPrompt.findMany({
    where: baseWhere,
    include: { author: { select: { id: true, name: true, image: true } } },
    orderBy: { createdAt: 'desc' },
  })
})
