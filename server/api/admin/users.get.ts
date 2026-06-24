import { prisma } from '~/server/utils/prisma'
import { requirePermission, getEffectivePermissions } from '~/server/utils/permissions'

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'admin.roles')

  const users = await prisma.user.findMany({
    where: { googleId: { not: 'system' } },
    include: {
      roles: { include: { role: true } },
      permOverrides: true,
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

  return Promise.all(users.map(async (u) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    image: u.image,
    isSuperAdmin: u.isSuperAdmin,
    createdAt: u.createdAt,
    roles: u.roles.map(ur => ur.role),
    projectRoles: u.projectRoles.map(upr => ({
      id: upr.projectRole.id,
      name: upr.projectRole.name,
      project: upr.projectRole.project,
    })),
    permOverrides: u.permOverrides,
    budget: u.budget,
    effectivePermissions: await getEffectivePermissions(u.id),
  })))
})
