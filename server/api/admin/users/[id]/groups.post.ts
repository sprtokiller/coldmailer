import { prisma } from '~/server/utils/prisma'
import { requirePermission } from '~/server/utils/permissions'

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'admin.roles')

  const userId = getRouterParam(event, 'id')!
  const body = await readBody<{ groupId: string }>(event)

  if (!body.groupId) throw createError({ statusCode: 400, statusMessage: 'groupId je povinné' })

  const [user, group] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.group.findUnique({ where: { id: body.groupId } }),
  ])
  if (!user) throw createError({ statusCode: 404, statusMessage: 'Uživatel nenalezen' })
  if (!group) throw createError({ statusCode: 404, statusMessage: 'Skupina nenalezena' })

  await prisma.userGroup.upsert({
    where: { userId_groupId: { userId, groupId: body.groupId } },
    create: { userId, groupId: body.groupId },
    update: {},
  })

  return { ok: true }
})
