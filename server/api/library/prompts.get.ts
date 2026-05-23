import { StepType, type Prisma } from '@prisma/client'
import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'
import { getEffectivePermissions } from '~/server/utils/permissions'

export default defineEventHandler(async (event) => {
  const session = await requireAuth(event)
  const { stepType } = getQuery(event)
  const requestedStepType = typeof stepType === 'string' && stepType in StepType
    ? stepType as StepType
    : undefined

  const perms = await getEffectivePermissions(session.id)
  const OR: Prisma.SystemPromptWhereInput[] = []
  if (perms.includes('prompts.system.read')) OR.push({ isSystem: true })
  if (perms.includes('prompts.own.read'))    OR.push({ authorId: session.id, isSystem: false })
  if (perms.includes('prompts.others.read')) OR.push({ authorId: { not: session.id }, isSystem: false })
  if (OR.length === 0) return []

  const baseWhere: Prisma.SystemPromptWhereInput = { OR }
  if (requestedStepType) baseWhere.stepType = requestedStepType

  return prisma.systemPrompt.findMany({
    where: baseWhere,
    include: { author: { select: { id: true, name: true, image: true } } },
    orderBy: { createdAt: 'desc' },
  })
})
