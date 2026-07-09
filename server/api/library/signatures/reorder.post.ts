import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const body = await readBody<{ ids: string[] }>(event)
  const ids = Array.isArray(body?.ids) ? body.ids.filter(id => typeof id === 'string') : []
  if (ids.length === 0) throw createError({ statusCode: 400, message: 'ids je povinné pole' })

  const signatures = await prisma.signature.findMany({ where: { id: { in: ids } } })
  if (signatures.length !== ids.length) throw createError({ statusCode: 404, message: 'Některý podpis nebyl nalezen' })
  if (signatures.some(s => s.isTemplate || s.authorId !== user.id)) {
    throw createError({ statusCode: 403, message: 'Nemáte oprávnění přeuspořádat tyto podpisy' })
  }

  await prisma.$transaction(
    ids.map((id, index) => prisma.signature.update({ where: { id }, data: { order: index } })),
  )

  return { success: true }
})
