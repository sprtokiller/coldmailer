import { prisma } from '~/server/utils/prisma'
import { requirePermission } from '~/server/utils/permissions'

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'admin.roles')

  const userId = getRouterParam(event, 'id')!
  const roleId = getRouterParam(event, 'roleId')!

  await prisma.userRole.deleteMany({ where: { userId, roleId } })
  return { ok: true }
})
