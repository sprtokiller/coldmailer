import { prisma } from '~/server/utils/prisma'
import { requirePermission } from '~/server/utils/permissions'
import { PROJECT_PERMISSIONS } from '~/server/utils/projectPermissions'

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'admin.roles')
  const roleId = getRouterParam(event, 'roleId')!
  const body = await readBody<{ name?: string; permissions?: string[] }>(event)

  const role = await prisma.projectRole.findUnique({ where: { id: roleId } })
  if (!role) throw createError({ statusCode: 404, statusMessage: 'Role nebyla nalezena.' })

  const data: Record<string, any> = {}
  if (body.name !== undefined && !role.isSystem) data.name = body.name.trim()
  if (body.permissions !== undefined) {
    data.permissions = body.permissions.filter(p => (PROJECT_PERMISSIONS as readonly string[]).includes(p))
  }

  return prisma.projectRole.update({ where: { id: roleId }, data })
})
