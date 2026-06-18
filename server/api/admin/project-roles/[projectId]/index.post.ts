import { prisma } from '~/server/utils/prisma'
import { requirePermission } from '~/server/utils/permissions'
import { PROJECT_PERMISSIONS } from '~/server/utils/projectPermissions'

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'admin.roles')
  const projectId = getRouterParam(event, 'projectId')!
  const body = await readBody<{ name: string; permissions: string[] }>(event)

  if (!body.name?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Název role je povinný.' })
  }

  const validPerms = body.permissions?.filter(p => (PROJECT_PERMISSIONS as readonly string[]).includes(p)) ?? []

  return prisma.projectRole.create({
    data: {
      projectId,
      name: body.name.trim(),
      permissions: validPerms,
    },
  })
})
