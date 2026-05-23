import { prisma } from '~/server/utils/prisma'
import { requirePermission, ALL_PERMISSIONS } from '~/server/utils/permissions'

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'admin.roles')

  const body = await readBody<{ name: string; description?: string; color?: string; permissions: string[] }>(event)

  if (!body.name?.trim()) throw createError({ statusCode: 400, statusMessage: 'Název role je povinný' })

  const validPerms = body.permissions.filter(p => (ALL_PERMISSIONS as readonly string[]).includes(p))

  return prisma.role.create({
    data: {
      name: body.name.trim(),
      description: body.description?.trim() ?? null,
      color: body.color ?? '#6366f1',
      permissions: validPerms,
    },
  })
})
