import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const query = getQuery(event)

  const type = query.type as string | undefined
  const search = query.search as string | undefined
  const pipelineRunId = query.pipelineRunId as string | undefined
  const excludeStepId = query.excludeStepId as string | undefined
  const offset = Number(query.offset ?? 0)
  const limit = Math.min(Number(query.limit ?? 50), 200)

  const withCount = query.withCount === 'true'

  // Exclude records already in this step, EXCEPT those added via GLOBAL_DB
  // (those should still appear in the list as pre-checked)
  let excludeIds: string[] = []
  if (excludeStepId) {
    const refs = await prisma.pipelineRecordRef.findMany({
      where: { stepId: excludeStepId },
      select: { globalRecordId: true },
    })
    excludeIds = refs.map(r => r.globalRecordId)
  }

  const where = {
    ...(type && { type: type as never }),
    ...(search && { canonicalName: { contains: search, mode: 'insensitive' } }),
    ...(pipelineRunId && { pipelineRefs: { some: { pipelineRunId } } }),
    ...(excludeIds.length > 0 && { id: { notIn: excludeIds } }),
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
