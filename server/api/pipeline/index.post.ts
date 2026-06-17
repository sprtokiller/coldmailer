import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'
import { getActiveGroupId } from '~/server/utils/activeGroup'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const groupId = await getActiveGroupId(event)
  const body = await readBody<{ name: string }>(event)

  return prisma.pipelineRun.create({
    data: {
      name: body.name,
      authorId: user.id,
      groupId,
    },
    include: {
      author: { select: { id: true, name: true, image: true } },
      steps: true,
    },
  })
})
