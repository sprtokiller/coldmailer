import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'

export default defineEventHandler(async (event) => {
  const session = await requireAuth(event)

  const user = await prisma.user.findUnique({
    where: { id: session.id },
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
  })
  if (!user) throw createError({ statusCode: 404, message: 'UĹľivatel nenalezen' })

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      image: user.image,
      isAdmin: user.isAdmin,
      createdAt: user.createdAt,
    },
    budget: user.budget,
    projectRoles: user.projectRoles.map(upr => ({
      id: upr.projectRole.id,
      name: upr.projectRole.name,
      project: upr.projectRole.project,
    })),
  }
})

