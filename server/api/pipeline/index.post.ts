import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const body = await readBody<{ name: string }>(event)

  return prisma.pipelineRun.create({
    data: {
      name: body.name,
      authorId: user.id,
    },
    include: {
      author: { select: { id: true, name: true, image: true } },
      steps: true,
    },
  })
})
