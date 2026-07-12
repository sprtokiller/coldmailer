import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'
import { getLibraryScopeFilter } from '~/server/utils/libraryScope'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const scopeFilter = await getLibraryScopeFilter(event)

  return prisma.contextPart.findMany({
    where: {
      OR: [
        { ...scopeFilter, isPrivate: false },
        { authorId: user.id, isPrivate: true },
      ],
    },
    include: {
      author: { select: { id: true, name: true, image: true } },
      group: true,
      project: { include: { group: true } },
    },
    orderBy: [{ order: 'asc' }, { createdAt: 'desc' }],
  })
})

