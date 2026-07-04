import { prisma } from '~/server/utils/prisma'
import { requireAdmin, requireResourceScopeAccess } from '~/server/utils/permissions'
import { requireAuth } from '~/server/utils/requireAuth'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const id = getRouterParam(event, 'id')!

  const part = await prisma.sellingPoint.findUnique({ where: { id } })
  if (!part) throw createError({ statusCode: 404, message: 'Prodejní argument nenalezen' })

  if (part.authorId !== user.id) {
    await requireAdmin(event)
  }
  await requireResourceScopeAccess(event, part)

  await prisma.$transaction([
    prisma.sellingPoint.updateMany({ where: { derivedFromId: id }, data: { derivedFromId: null } }),
    prisma.sellingPoint.delete({ where: { id } }),
  ])

  return { ok: true }
})
