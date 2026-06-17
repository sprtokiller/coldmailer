import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const nId = getRouterParam(event, 'nId')!

  const note = await prisma.partnerNote.findUnique({ where: { id: nId } })
  if (!note) throw createError({ statusCode: 404, statusMessage: 'Not found' })
  if (note.authorId !== user.id) throw createError({ statusCode: 403, statusMessage: 'Forbidden' })

  await prisma.partnerNote.delete({ where: { id: nId } })
  return { ok: true }
})
