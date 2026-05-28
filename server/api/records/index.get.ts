import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const query = getQuery(event)

  const type = query.type as string | undefined
  const search = query.search as string | undefined
  const pipelineRunId = query.pipelineRunId as string | undefined
  const offset = Number(query.offset ?? 0)
  const limit = Math.min(Number(query.limit ?? 50), 200)

  const withCount = query.withCount === 'true'

  const where = {
    ...(type && { type: type as never }),
    ...(search && { canonicalName: { contains: search, mode: 'insensitive' } }),
    ...(pipelineRunId && { pipelineRefs: { some: { pipelineRunId } } }),
  }

  const findMany = prisma.globalRecord.findMany({
    where,
    include: {
      creator: { select: { id: true, name: true, image: true } },
      _count: { select: { pipelineRefs: true, events: true } },
      pipelineRefs: {
        select: {
          id: true,
          addedAt: true,
          pipelineRun: { select: { id: true, name: true } },
          step: { select: { stepType: true } },
        },
        orderBy: { addedAt: 'desc' },
        take: 10,
      },
    },
    orderBy: { createdAt: 'desc' },
    skip: offset,
    take: limit,
  })

  if (!withCount) return findMany

  const [records, total] = await Promise.all([findMany, prisma.globalRecord.count({ where })])
  return { records, total }
})
