import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  return prisma.pipelineRun.findMany({
    include: {
      author: { select: { id: true, name: true, image: true } },
      steps: { select: { stepType: true, status: true } },
    },
    orderBy: { createdAt: 'desc' },
  })
})
