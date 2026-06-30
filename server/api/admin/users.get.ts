import { prisma } from '~/server/utils/prisma'
import { requireAdmin } from '~/server/utils/permissions'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const users = await prisma.user.findMany({
    where: { googleId: { not: 'system' } },
    include: {
      budget: true,
      projectRoles: {
        include: {
          projectRole: {
            include: { project: { include: { group: true } } },
          },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  })

  return users.map(u => ({
    id: u.id,
    email: u.email,
    name: u.name,
    image: u.image,
    isAdmin: u.isAdmin,
    createdAt: u.createdAt,
    projectRoles: u.projectRoles.map(upr => ({
      id: upr.projectRole.id,
      name: upr.projectRole.name,
      project: upr.projectRole.project,
    })),
    budget: u.budget,
  }))
})

