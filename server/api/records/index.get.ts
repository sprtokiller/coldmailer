import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const query = getQuery(event)

  const type = query.type as string | undefined
  const status = query.status as string | undefined
  const search = query.search as string | undefined
  const pipelineRunId = query.pipelineRunId as string | undefined
  const offset = Number(query.offset ?? 0)
  const limit = Math.min(Number(query.limit ?? 50), 200)

  return prisma.globalRecord.findMany({
    where: {
      ...(type && { type: type as never }),
      ...(status && { relevanceStatus: status as never }),
      ...(search && { canonicalName: { contains: search, mode: 'insensitive' } }),
      ...(pipelineRunId && { pipelineRefs: { some: { pipelineRunId } } }),
    },
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
})
