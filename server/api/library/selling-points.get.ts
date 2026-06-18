import { prisma } from '~/server/utils/prisma'
import { requirePermission } from '~/server/utils/permissions'
import { getLibraryScopeFilter } from '~/server/utils/libraryScope'

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'selling.own.read')
  const scopeFilter = await getLibraryScopeFilter(event)

  return prisma.sellingPoint.findMany({
    where: scopeFilter,
    include: {
      author: { select: { id: true, name: true, image: true } },
      group: true,
      project: { include: { group: true } },
    },
    orderBy: { createdAt: 'desc' },
  })
})
