import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const query = getQuery(event)

  const type = query.type as string | undefined
  const search = query.search as string | undefined
  const offset = Number(query.offset ?? 0)
  const limit = Math.min(Number(query.limit ?? 50), 200)

  const withCount = query.withCount === 'true'

  const where = {
    ...(type && { type: type as never }),
    ...(search && { canonicalName: { contains: search, mode: 'insensitive' as never } }),
  }

  const findMany = prisma.globalRecord.findMany({
    where,
    include: {
      creator: { select: { id: true, name: true, image: true } },
      _count: { select: { events: true } },
      negotiations: { select: { project: { select: { id: true, name: true } } } },
      contacts: { select: { id: true, address: true, firstName: true, lastName: true, role: true, contactType: true, note: true, priority: true } },
    },
    orderBy: { createdAt: 'desc' },
    skip: offset,
    take: limit,
  })

  if (!withCount) return findMany

  const [records, total] = await Promise.all([findMany, prisma.globalRecord.count({ where })])
  return { records, total }
})

