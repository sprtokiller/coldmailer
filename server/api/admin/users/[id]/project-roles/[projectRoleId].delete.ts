import { prisma } from '~/server/utils/prisma'
import { requirePermission } from '~/server/utils/permissions'

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'admin.roles')
  const userId = getRouterParam(event, 'id')!
  const projectRoleId = getRouterParam(event, 'projectRoleId')!

  await prisma.userProjectRole.delete({
    where: { userId_projectRoleId: { userId, projectRoleId } },
  })

  return { ok: true }
})
