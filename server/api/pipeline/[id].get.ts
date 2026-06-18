import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const id = getRouterParam(event, 'id')!

  const run = await prisma.pipelineRun.findUnique({
    where: { id },
    include: {
      author: { select: { id: true, name: true, image: true } },
      project: { include: { group: true } },
      steps: {
        include: {
          systemPrompt: true,
          sellingPoint: true,
          runner: { select: { id: true, name: true, image: true } },
        },
        orderBy: { createdAt: 'asc' },
      },
    },
  })

  if (!run) throw createError({ statusCode: 404, statusMessage: 'Pipeline run not found' })
  return run
})
