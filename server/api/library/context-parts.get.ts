import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'
import { getActiveGroupId } from '~/server/utils/activeGroup'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const groupId = await getActiveGroupId(event)
  if (!groupId) return []

  return prisma.contextPart.findMany({
    where: { groupId },
    include: { author: { select: { id: true, name: true, image: true } } },
    orderBy: { createdAt: 'desc' },
  })
})
