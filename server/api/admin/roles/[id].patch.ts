import { prisma } from '~/server/utils/prisma'
import { requirePermission, ALL_PERMISSIONS } from '~/server/utils/permissions'

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'admin.roles')

  const id = getRouterParam(event, 'id')!
  const body = await readBody<{ name?: string; description?: string; color?: string; permissions?: string[] }>(event)

  const role = await prisma.role.findUnique({ where: { id } })
  if (!role) throw createError({ statusCode: 404, statusMessage: 'Role nenalezena' })

  const data: Record<string, unknown> = {}
  if (body.name !== undefined) data.name = body.name.trim()
  if (body.description !== undefined) data.description = body.description?.trim() ?? null
  if (body.color !== undefined) data.color = body.color
  if (body.permissions !== undefined) data.permissions = body.permissions.filter(p => (ALL_PERMISSIONS as readonly string[]).includes(p))

  return prisma.role.update({ where: { id }, data })
})
