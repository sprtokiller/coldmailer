import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'
import { getLibraryScopeFilter } from '~/server/utils/libraryScope'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const scopeFilter = await getLibraryScopeFilter(event)

  return prisma.emailDraft.findMany({
    where: scopeFilter,
    include: {
      author: { select: { id: true, name: true, image: true } },
      group: true,
      project: { include: { group: true } },
    },
    orderBy: [{ order: 'asc' }, { createdAt: 'desc' }],
  })
})

