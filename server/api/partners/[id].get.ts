import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const id = getRouterParam(event, 'id')!

  const record = await prisma.globalRecord.findUnique({
    where: { id },
    include: {
      contacts: { orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] },
      assignments: {
        include: { user: { select: { id: true, name: true, image: true } } },
        orderBy: { assignedAt: 'asc' },
      },
      mailEvents: {
        include: { creator: { select: { id: true, name: true, image: true } } },
        orderBy: { sentAt: 'asc' },
      },
      partnerNotes: {
        include: { author: { select: { id: true, name: true, image: true } } },
        orderBy: { createdAt: 'asc' },
      },
      fulfillment: true,
    },
  })

  if (!record) throw createError({ statusCode: 404, statusMessage: 'Not found' })
  return record
})
