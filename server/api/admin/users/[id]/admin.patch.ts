import { prisma } from '~/server/utils/prisma'
import { requireAdmin } from '~/server/utils/permissions'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const targetUserId = getRouterParam(event, 'id')!
  const body = await readBody<{ isAdmin: boolean }>(event)

  const user = await prisma.user.findUnique({ where: { id: targetUserId, googleId: { not: 'system' } } })
  if (!user) throw createError({ statusCode: 404, statusMessage: 'Uživatel nenalezen' })

  if (!body.isAdmin) {
    const otherAdminCount = await prisma.user.count({
      where: { isAdmin: true, id: { not: targetUserId }, googleId: { not: 'system' } },
    })
    if (otherAdminCount === 0) {
      throw createError({ statusCode: 400, statusMessage: 'Nelze odebrat status posledního admina. Nejprve přidělte admin status jinému uživateli.' })
    }
  }

  return prisma.user.update({
    where: { id: targetUserId },
    data: { isAdmin: body.isAdmin },
    select: { id: true, isAdmin: true },
  })
})
