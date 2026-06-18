import { prisma } from '~/server/utils/prisma'
import { requirePermission } from '~/server/utils/permissions'

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'admin.roles')
  const roleId = getRouterParam(event, 'roleId')!

  const role = await prisma.projectRole.findUnique({ where: { id: roleId } })
  if (!role) throw createError({ statusCode: 404, statusMessage: 'Role nebyla nalezena.' })
  if (role.isSystem) throw createError({ statusCode: 403, statusMessage: 'Systémovou roli nelze smazat.' })

  await prisma.projectRole.delete({ where: { id: roleId } })
  return { ok: true }
})
