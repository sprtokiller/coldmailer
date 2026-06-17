import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'
import { getActiveGroupId } from '~/server/utils/activeGroup'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const id = getRouterParam(event, 'id')!
  const groupId = await getActiveGroupId(event)

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
        where: groupId ? { groupId } : {},
        include: { author: { select: { id: true, name: true, image: true } } },
        orderBy: { createdAt: 'asc' },
      },
      fulfillments: {
        where: groupId ? { groupId } : {},
      },
    },
  })

  if (!record) throw createError({ statusCode: 404, statusMessage: 'Not found' })

  return {
    ...record,
    fulfillment: record.fulfillments[0] ?? null,
  }
})
