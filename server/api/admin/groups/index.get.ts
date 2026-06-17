import { prisma } from '~/server/utils/prisma'
import { requirePermission } from '~/server/utils/permissions'

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'admin.roles')
  return prisma.group.findMany({
    include: { members: { include: { user: { select: { id: true, name: true, email: true, image: true } } } } },
    orderBy: { name: 'asc' },
  })
})
