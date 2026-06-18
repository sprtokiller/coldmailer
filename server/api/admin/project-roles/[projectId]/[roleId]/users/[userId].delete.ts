import { prisma } from '~/server/utils/prisma'
import { requirePermission } from '~/server/utils/permissions'

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'admin.roles')
  const roleId = getRouterParam(event, 'roleId')!
  const userId = getRouterParam(event, 'userId')!

  await prisma.userProjectRole.delete({
    where: { userId_projectRoleId: { userId, projectRoleId: roleId } },
  })
  return { ok: true }
})
