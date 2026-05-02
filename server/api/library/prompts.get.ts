import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const { stepType } = getQuery(event)

  return prisma.systemPrompt.findMany({
    where: stepType ? { stepType: stepType as string } : undefined,
    include: { author: { select: { id: true, name: true, image: true } } },
    orderBy: { createdAt: 'desc' },
  })
})
