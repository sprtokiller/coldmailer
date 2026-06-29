import { prisma } from '~/server/utils/prisma'
import { requireAdmin } from '~/server/utils/permissions'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const roleId = getRouterParam(event, 'roleId')!
  const userId = getRouterParam(event, 'userId')!

  await prisma.userProjectRole.delete({
    where: { userId_projectRoleId: { userId, projectRoleId: roleId } },
  })
  return { ok: true }
})
