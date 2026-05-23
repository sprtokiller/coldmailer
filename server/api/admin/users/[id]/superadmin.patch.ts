import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'

export default defineEventHandler(async (event) => {
  const session = await requireAuth(event)
  if (!session.isSuperAdmin) {
    throw createError({ statusCode: 403, statusMessage: 'Pouze superadmin může měnit superadmin status' })
  }

  const targetUserId = getRouterParam(event, 'id')!
  const body = await readBody<{ isSuperAdmin: boolean }>(event)

  const user = await prisma.user.findUnique({ where: { id: targetUserId, googleId: { not: 'system' } } })
  if (!user) throw createError({ statusCode: 404, statusMessage: 'Uživatel nenalezen' })

  if (!body.isSuperAdmin) {
    const otherSuperadminCount = await prisma.user.count({
      where: { isSuperAdmin: true, id: { not: targetUserId }, googleId: { not: 'system' } },
    })
    if (otherSuperadminCount === 0) {
      throw createError({ statusCode: 400, statusMessage: 'Nelze odebrat status posledního superadmina. Nejprve přidělte superadmin status jinému uživateli.' })
    }
  }

  return prisma.user.update({
    where: { id: targetUserId },
    data: { isSuperAdmin: body.isSuperAdmin },
    select: { id: true, isSuperAdmin: true },
  })
})
