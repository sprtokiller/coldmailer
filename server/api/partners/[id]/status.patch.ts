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
  const { actionStatus, dealStage, addAssigneeId, removeAssigneeId } = body

  if (actionStatus !== undefined || dealStage !== undefined) {
    await prisma.projectRecord.upsert({
      where: { projectId_globalRecordId: { projectId, globalRecordId } },
      create: { projectId, globalRecordId, ...(actionStatus !== undefined && { actionStatus }), ...(dealStage !== undefined && { dealStage }) },
      update: { ...(actionStatus !== undefined && { actionStatus }), ...(dealStage !== undefined && { dealStage }) },
    })
  }

  if (addAssigneeId) {
    await prisma.outreachAssignment.upsert({
      where: { projectId_globalRecordId: { projectId, globalRecordId } },
      create: { projectId, globalRecordId, assigneeId: addAssigneeId, assignedById: session.id },
      update: { assigneeId: addAssigneeId, assignedById: session.id },
    })
  }

  if (removeAssigneeId) {
    await prisma.outreachAssignment.deleteMany({
      where: { projectId, globalRecordId, assigneeId: removeAssigneeId },
    })
  }

  return { success: true }
})
