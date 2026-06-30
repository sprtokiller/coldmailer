import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'
import { getActiveScope } from '~/server/utils/activeProject'
import { getInteractionAccess } from '~/server/utils/projectPermissions'

export default defineEventHandler(async (event) => {
  const session = await requireAuth(event)
  const globalRecordId = getRouterParam(event, 'id')!
  const scope = await getActiveScope(event)
  const projectId = scope.project?.id

  if (!projectId) {
    throw createError({ statusCode: 400, message: 'No active project context' })
  }

  const access = await getInteractionAccess(session.id, projectId)
  if (!access.canEditAll && !access.isAdmin) {
    throw createError({ statusCode: 403, message: 'Nemáte oprávnění editovat tohoto partnera.' })
  }

  const body = await readBody(event)
  const { actionStatus, dealStage, addCoAssigneeId, removeCoAssigneeId } = body

  // Find the most recent pipelineRef for this partner in the current project
  const currentRef = await prisma.pipelineRecordRef.findFirst({
    where: {
      globalRecordId,
      pipelineRun: { projectId }
    },
    orderBy: { addedAt: 'desc' }
  })

  if (!currentRef) {
    throw createError({ statusCode: 404, message: 'PipelineRecordRef not found for this partner in current project' })
  }

  const data: any = {}
  if (actionStatus !== undefined) data.actionStatus = actionStatus
  if (dealStage !== undefined) data.dealStage = dealStage

  const coAssigneeOps: Record<string, { id: string }>[] = []

  if (addCoAssigneeId && currentRef.assigneeId !== addCoAssigneeId) {
    coAssigneeOps.push({ connect: { id: addCoAssigneeId } })
  }

  if (removeCoAssigneeId) {
    if (currentRef.assigneeId === removeCoAssigneeId) {
      data.assigneeId = null
    } else {
      coAssigneeOps.push({ disconnect: { id: removeCoAssigneeId } })
    }
  }

  if (coAssigneeOps.length === 1) {
    data.coAssignees = coAssigneeOps[0]
  } else if (coAssigneeOps.length > 1) {
    data.coAssignees = Object.assign({}, ...coAssigneeOps)
  }

  if (Object.keys(data).length > 0) {
    await prisma.pipelineRecordRef.update({
      where: { id: currentRef.id },
      data
    })
  }

  return { success: true }
})
