import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'
import { getActiveScope } from '~/server/utils/activeProject'

export default defineEventHandler(async (event) => {
  await requireAuth(event)

  const query = getQuery(event)
  const search = (query.search as string)?.trim()
  if (!search || search.length < 2) {
    return []
  }

  const scope = await getActiveScope(event)
  const projectId = scope.project?.id

  const records = await prisma.globalRecord.findMany({
    where: {
      type: 'PARTNER',
      canonicalName: { contains: search, mode: 'insensitive' },
    },
    select: {
      id: true,
      canonicalName: true,
      payload: true,
      ...(projectId && {
        _count: {
          select: { interactions: { where: { projectId } } },
        },
      }),
    },
    orderBy: { canonicalName: 'asc' },
    take: 20,
  })

  return records.map((r) => {
    const payload = r.payload as Record<string, unknown> | null
    return {
      id: r.id,
      canonicalName: r.canonicalName,
      industry: payload?.industry ?? null,
      size: payload?.size ?? null,
      website: payload?.website ?? payload?.url ?? null,
      hasInteractionsInProject: projectId ? ((r as any)._count?.interactions ?? 0) > 0 : false,
    }
  })
})
