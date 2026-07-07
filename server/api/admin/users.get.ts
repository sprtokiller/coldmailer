import { prisma } from '~/server/utils/prisma'
import { requireAdmin } from '~/server/utils/permissions'
import { getUnreadCountForUser } from '~/server/utils/unread-email-count'

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

  return Promise.all(users.map(async u => ({
    id: u.id,
    email: u.email,
    name: u.name,
    image: u.image,
    isAdmin: u.isAdmin,
    createdAt: u.createdAt,
    lastLoginAt: u.lastLoginAt,
    projectRoles: u.projectRoles.map(upr => ({
      id: upr.projectRole.id,
      name: upr.projectRole.name,
      project: upr.projectRole.project,
    })),
    budget: u.budget,
    unreadEmailCount: await getUnreadCountForUser(u.id),
  })))
})

