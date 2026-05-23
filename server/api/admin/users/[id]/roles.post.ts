import { prisma } from '~/server/utils/prisma'
import { requirePermission } from '~/server/utils/permissions'

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'admin.roles')

  const userId = getRouterParam(event, 'id')!
  const body = await readBody<{ roleId: string }>(event)

  if (!body.roleId) throw createError({ statusCode: 400, statusMessage: 'roleId je povinné' })

  const [user, role] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.role.findUnique({ where: { id: body.roleId } }),
  ])
  if (!user) throw createError({ statusCode: 404, statusMessage: 'Uživatel nenalezen' })
  if (!role) throw createError({ statusCode: 404, statusMessage: 'Role nenalezena' })

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId, roleId: body.roleId } },
    create: { userId, roleId: body.roleId },
    update: {},
  })

  return { ok: true }
})
