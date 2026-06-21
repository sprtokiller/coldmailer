import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'
import { getActiveScope } from '~/server/utils/activeProject'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const query = getQuery(event)
  const search = query.search as string | undefined
  const scope = await getActiveScope(event)
  const projectId = scope.project?.id

  const interactionWhere = projectId ? { projectId } : {}

  const records = await prisma.globalRecord.findMany({
    where: {
      type: 'PARTNER',
      ...(search && { canonicalName: { contains: search, mode: 'insensitive' } }),
      interactions: { some: interactionWhere },
    },
    include: {
      contacts: { orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] },
      interactions: {
        where: interactionWhere,
        select: { updatedAt: true, sentAt: true, dealStage: true },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
      _count: {
        select: {
          interactions: projectId ? { where: { projectId } } : true,
        },
      },
    },
    orderBy: { canonicalName: 'asc' },
  })

  const recordIds = records.map(r => r.id)
  const assigneeRows = recordIds.length > 0
    ? await prisma.interactionAssignee.findMany({
        where: { interaction: { globalRecordId: { in: recordIds }, ...interactionWhere } },
        select: {
          interaction: { select: { globalRecordId: true } },
          user: { select: { id: true, name: true, image: true } },
        },
        distinct: ['userId', 'interactionId'],
      })
    : []

  const assigneesByRecord = new Map<string, Map<string, { id: string; name: string; image: string | null }>>()
  for (const row of assigneeRows) {
    let map = assigneesByRecord.get(row.interaction.globalRecordId)
    if (!map) {
      map = new Map()
      assigneesByRecord.set(row.interaction.globalRecordId, map)
    }
    map.set(row.user.id, row.user)
  }

  return records.map((r) => {
    const lastInteraction = r.interactions[0] ?? null
    return {
      id: r.id,
      type: r.type,
      canonicalName: r.canonicalName,
      normalizedName: r.normalizedName,
      payload: r.payload,
      contacts: r.contacts,
      assignees: [...(assigneesByRecord.get(r.id)?.values() ?? [])],
      lastInteractionAt: lastInteraction?.sentAt ?? lastInteraction?.updatedAt ?? null,
      interactionCount: r._count.interactions,
      dealStage: lastInteraction?.dealStage ?? null,
    }
  })
})
