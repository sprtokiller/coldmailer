import { prisma } from '~/server/utils/prisma'
import { requireAdmin } from '~/server/utils/permissions'
import { requireAuth } from '~/server/utils/requireAuth'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const id = getRouterParam(event, 'id')!

  const sig = await prisma.signature.findUnique({ where: { id } })
  if (!sig) throw createError({ statusCode: 404, message: 'Podpis nenalezen' })

  if (sig.isTemplate) {
    await requireAdmin(event)
  } else {
    if (sig.authorId !== user.id) throw createError({ statusCode: 403, message: 'Nemáte oprávnění smazat tento podpis' })
  }

  await prisma.signature.delete({ where: { id } })
  return { ok: true }
})
