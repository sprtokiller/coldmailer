import { prisma } from '~/server/utils/prisma'
import { requireAdmin } from '~/server/utils/permissions'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  return prisma.group.findMany({
    include: {
      projects: { include: { projectRoles: { orderBy: { name: 'asc' } } }, orderBy: { name: 'asc' } },
    },
    orderBy: { name: 'asc' },
  })
})

