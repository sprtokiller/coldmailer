import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)

  return prisma.user.findMany({
    where: { googleId: { not: 'system' } },
    select: { id: true, name: true, image: true, email: true },
    orderBy: { name: 'asc' },
  })
})
