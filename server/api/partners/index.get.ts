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
      contacts: { orderBy: [{ isPrimary: 'desc' }, { priority: 'asc' }, { createdAt: 'asc' }] },
      interactions: {
        where: interactionWhere,
        select: { updatedAt: true, sentAt: true },
        orderBy: { sentAt: 'desc' },
        take: 1,
      },
      outreachAssignments: {
        where: projectId ? { projectId } : undefined,
        select: { assignee: { select: { id: true, name: true, image: true } } },
      },
      projectRecords: {
        where: projectId ? { projectId } : undefined,
        select: { negotiationStatus: true },
      },
      _count: {
        select: {
          interactions: projectId ? { where: { projectId } } : true,
        },
      },
    },
    orderBy: { canonicalName: 'asc' },
  })

  return records.map((r) => {
    const lastInteraction = r.interactions[0] ?? null
    const projectRecord = r.projectRecords[0] ?? null

    return {
      id: r.id,
      type: r.type,
      canonicalName: r.canonicalName,
      normalizedName: r.normalizedName,
      payload: r.payload,
      contacts: r.contacts,
      assignees: r.outreachAssignments.map(a => a.assignee),
      lastInteractionAt: lastInteraction?.sentAt ?? lastInteraction?.updatedAt ?? null,
      interactionCount: r._count.interactions,
      negotiationStatus: projectRecord?.negotiationStatus ?? null,
    }
  })
})

