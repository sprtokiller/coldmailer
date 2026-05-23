import { prisma } from '~/server/utils/prisma'
import { requirePermission } from '~/server/utils/permissions'

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'admin.roles')

  const id = getRouterParam(event, 'id')!

  const role = await prisma.role.findUnique({ where: { id } })
  if (!role) throw createError({ statusCode: 404, statusMessage: 'Role nenalezena' })
  if (role.isSystem) throw createError({ statusCode: 400, statusMessage: 'Systémové role nelze smazat' })

  await prisma.role.delete({ where: { id } })
  return { ok: true }
})
