import { prisma } from '~/server/utils/prisma'
import { requirePermission } from '~/server/utils/permissions'

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'admin.roles')
  const userId = getRouterParam(event, 'id')!
  const body = await readBody<{ projectRoleId: string }>(event)

  const [user, projectRole] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.projectRole.findUnique({ where: { id: body.projectRoleId } }),
  ])
  if (!user) throw createError({ statusCode: 404, statusMessage: 'Uživatel nenalezen.' })
  if (!projectRole) throw createError({ statusCode: 404, statusMessage: 'Projektová role nenalezena.' })

  return prisma.userProjectRole.upsert({
    where: { userId_projectRoleId: { userId, projectRoleId: body.projectRoleId } },
    create: { userId, projectRoleId: body.projectRoleId },
    update: {},
    include: { projectRole: { include: { project: { include: { group: true } } } } },
  })
})
