import { prisma } from '~/server/utils/prisma'
import { requirePermission } from '~/server/utils/permissions'

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'admin.roles')
  const projectId = getRouterParam(event, 'projectId')!

  return prisma.projectRole.findMany({
    where: { projectId },
    include: {
      users: {
        include: { user: { select: { id: true, name: true, email: true, image: true } } },
      },
    },
    orderBy: { createdAt: 'asc' },
  })
})
