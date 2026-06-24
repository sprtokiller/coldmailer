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
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
      pipelineRefs: {
        where: projectId ? { pipelineRun: { projectId } } : undefined,
        orderBy: { addedAt: 'desc' },
        take: 1,
        select: {
          dealStage: true,
          actionStatus: true,
          assignee: { select: { id: true, name: true, image: true } },
          coAssignees: { select: { id: true, name: true, image: true } }
        },
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
    const currentRef = r.pipelineRefs[0] ?? null
    
    const assigneesMap = new Map<string, { id: string; name: string; image: string | null }>()
    if (currentRef?.assignee) {
      assigneesMap.set(currentRef.assignee.id, currentRef.assignee)
    }
    if (currentRef?.coAssignees) {
      for (const ca of currentRef.coAssignees) {
        assigneesMap.set(ca.id, ca)
      }
    }

    return {
      id: r.id,
      type: r.type,
      canonicalName: r.canonicalName,
      normalizedName: r.normalizedName,
      payload: r.payload,
      contacts: r.contacts,
      assignees: Array.from(assigneesMap.values()),
      lastInteractionAt: lastInteraction?.sentAt ?? lastInteraction?.updatedAt ?? null,
      interactionCount: r._count.interactions,
      dealStage: currentRef?.dealStage ?? null,
      actionStatus: currentRef?.actionStatus ?? null,
    }
  })
})
