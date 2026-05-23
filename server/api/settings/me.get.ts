import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'
import { getEffectivePermissions } from '~/server/utils/permissions'

export default defineEventHandler(async (event) => {
  const session = await requireAuth(event)

  const user = await prisma.user.findUnique({
    where: { id: session.id },
    include: {
      roles: { include: { role: true } },
      permOverrides: true,
      budget: true,
    },
  })
  if (!user) throw createError({ statusCode: 404, statusMessage: 'Uživatel nenalezen' })

  const effectivePermissions = await getEffectivePermissions(session.id)

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      image: user.image,
      isSuperAdmin: user.isSuperAdmin,
      createdAt: user.createdAt,
    },
    roles: user.roles.map(ur => ur.role),
    permOverrides: user.permOverrides,
    budget: user.budget,
    effectivePermissions,
  }
})
