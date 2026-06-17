import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'

export default defineEventHandler(async (event) => {
  const session = await requireAuth(event)
  const memberships = await prisma.userGroup.findMany({
    where: { userId: session.id },
    include: { group: true },
    orderBy: { group: { name: 'asc' } },
  })
  return memberships.map(m => m.group)
})
