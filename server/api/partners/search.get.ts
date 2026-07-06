import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'
import { getActiveScope } from '~/server/utils/activeProject'

export default defineEventHandler(async (event) => {
  await requireAuth(event)

  const query = getQuery(event)
  const search = (query.search as string)?.trim() || ''
  
  const scope = await getActiveScope(event)
  const projectId = scope.project?.id

  let ids: string[] | undefined
  if (search) {
    const rawIds = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM "GlobalRecord"
      WHERE type = 'PARTNER'
      AND ("canonicalName" ILIKE ${'%' + search + '%'} OR payload::text ILIKE ${'%' + search + '%'})
      ORDER BY "canonicalName" ASC
      LIMIT 50
    `
    ids = rawIds.map(r => r.id)
  }

  const records = await prisma.globalRecord.findMany({
    where: {
      type: 'PARTNER',
      ...(ids && { id: { in: ids } }),
    },
    select: {
      id: true,
      canonicalName: true,
      payload: true,
      ...(projectId && {
        _count: {
          select: { negotiations: { where: { projectId, removedAt: null } } },
        },
      }),
    },
    orderBy: { canonicalName: 'asc' },
    take: 50,
  })

  // If ids were fetched, we want to maintain the order from raw query since it might be more relevant,
  // but findMany with 'in' doesn't preserve order. Since we sort by canonicalName ASC in both, it's fine.

  return records.map((r) => {
    const payload = r.payload as unknown as Record<string, unknown> | null
    return {
      id: r.id,
      canonicalName: r.canonicalName,
      industry: payload?.industry ?? null,
      size: payload?.size ?? null,
      website: payload?.website ?? payload?.url ?? null,
      hasNegotiation: projectId ? ((r as any)._count?.negotiations ?? 0) > 0 : false,
    }
  })
})

