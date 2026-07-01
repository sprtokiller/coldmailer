import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  return prisma.signature.findMany({
    where: { OR: [{ authorId: user.id }, { isSystem: true }] },
    orderBy: { createdAt: 'desc' },
  })
})

