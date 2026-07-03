import { StepType, type Prisma } from '@prisma/client'
import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'
import { getLibraryScopeFilter } from '~/server/utils/libraryScope'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const { stepType } = getQuery(event)
  const requestedStepType = typeof stepType === 'string' && stepType in StepType
    ? stepType as StepType
    : undefined

  const scopeFilter = await getLibraryScopeFilter(event)

  const OR: Prisma.SystemPromptWhereInput[] = [
    { isSystem: true },
    { isSystem: false, ...scopeFilter },
  ]

  const baseWhere: Prisma.SystemPromptWhereInput = { OR }
  if (requestedStepType) baseWhere.stepType = requestedStepType

  return prisma.systemPrompt.findMany({
    where: baseWhere,
    include: {
      author: { select: { id: true, name: true, image: true } },
      group: true,
      project: { include: { group: true } },
    },
    orderBy: [{ order: 'asc' }, { createdAt: 'desc' }],
  })
})

