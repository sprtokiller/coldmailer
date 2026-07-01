import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const id = getRouterParam(event, 'id')!

  const existing = await prisma.globalRecord.findUnique({ where: { id }, select: { id: true, type: true } })
  if (!existing) throw createError({ statusCode: 404, message: 'Partner nenalezen.' })
  if (existing.type !== 'PARTNER') throw createError({ statusCode: 400, message: 'Záznam není typu PARTNER.' })

  await prisma.$transaction([
    prisma.partnerContact.deleteMany({ where: { globalRecordId: id } }),
    prisma.globalRecord.delete({ where: { id } }),
  ])

  return { success: true }
})
