import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  return prisma.signature.findMany({
    where: { authorId: user.id, isSystem: false },
    orderBy: { createdAt: 'desc' },
  })
})
