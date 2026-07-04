import { prisma } from '~/server/utils/prisma'
import { requireAdmin, requireResourceScopeAccess } from '~/server/utils/permissions'
import { requireAuth } from '~/server/utils/requireAuth'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const id = getRouterParam(event, 'id')!

  const part = await prisma.contextPart.findUnique({ where: { id } })
  if (!part) throw createError({ statusCode: 404, message: 'Kontextová část nenalezena' })

  if (part.authorId !== user.id) {
    await requireAdmin(event)
  }
  await requireResourceScopeAccess(event, part)

  await prisma.$transaction([
    prisma.contextPart.updateMany({ where: { derivedFromId: id }, data: { derivedFromId: null } }),
    prisma.contextPart.delete({ where: { id } }),
  ])

  return { ok: true }
})
