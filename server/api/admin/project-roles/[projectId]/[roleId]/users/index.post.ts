import { prisma } from '~/server/utils/prisma'
import { requireAdmin } from '~/server/utils/permissions'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const roleId = getRouterParam(event, 'roleId')!
  const { userId } = await readBody<{ userId: string }>(event)

  if (!userId) throw createError({ statusCode: 400, statusMessage: 'userId je povinné' })

  return prisma.userProjectRole.upsert({
    where: { userId_projectRoleId: { userId, projectRoleId: roleId } },
    create: { userId, projectRoleId: roleId },
    update: {},
    include: { user: { select: { id: true, name: true, email: true, image: true } } },
  })
})
