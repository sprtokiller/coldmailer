import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'
import { getActiveScope } from '~/server/utils/activeProject'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const id = getRouterParam(event, 'id')!
  const scope = await getActiveScope(event)
  const projectId = scope.project?.id

  const record = await prisma.globalRecord.findUnique({
    where: { id },
    include: {
      contacts: { orderBy: [{ isPrimary: 'desc' }, { priority: 'asc' }, { createdAt: 'asc' }] },
      pipelineRefs: {
        where: projectId ? { pipelineRun: { projectId } } : undefined,
        orderBy: { addedAt: 'desc' },
        take: 1,
        include: {
          assignee: { select: { id: true, name: true, image: true } },
          coAssignees: { select: { id: true, name: true, image: true } }
        }
      }
    },
  })

  if (!record) throw createError({ statusCode: 404, statusMessage: 'Not found' })

  const currentRef = record.pipelineRefs[0]

  const solutionAssignees = []
  if (currentRef?.assignee) solutionAssignees.push(currentRef.assignee)
  if (currentRef?.coAssignees) {
    for (const ca of currentRef.coAssignees) {
      if (ca.id !== currentRef.assignee?.id) solutionAssignees.push(ca)
    }
  }

  return {
    ...record,
    pipelineRefId: currentRef?.id ?? null,
    actionStatus: currentRef?.actionStatus ?? null,
    dealStage: currentRef?.dealStage ?? null,
    assignees: solutionAssignees,
  }
})
