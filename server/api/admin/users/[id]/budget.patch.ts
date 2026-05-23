import { prisma } from '~/server/utils/prisma'
import { requirePermission } from '~/server/utils/permissions'

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'admin.roles')

  const userId = getRouterParam(event, 'id')!
  const body = await readBody<{ limitUsd: number | null }>(event)

  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) throw createError({ statusCode: 404, statusMessage: 'Uživatel nenalezen' })

  return prisma.userBudget.upsert({
    where: { userId },
    create: { userId, limitUsd: body.limitUsd },
    update: { limitUsd: body.limitUsd },
  })
})
