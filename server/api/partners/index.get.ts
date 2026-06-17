import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const query = getQuery(event)
  const search = query.search as string | undefined

  const records = await prisma.globalRecord.findMany({
    where: {
      type: 'PARTNER',
      ...(search && { canonicalName: { contains: search, mode: 'insensitive' } }),
    },
    include: {
      contacts: { orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] },
      assignments: {
        include: { user: { select: { id: true, name: true, image: true } } },
      },
      mailEvents: {
        select: { id: true, direction: true, sentAt: true },
        orderBy: { sentAt: 'desc' },
        take: 1,
      },
      _count: { select: { mailEvents: true, partnerNotes: true } },
    },
    orderBy: { canonicalName: 'asc' },
  })

  return records
})
