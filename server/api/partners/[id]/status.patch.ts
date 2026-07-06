import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'
import { getActiveScope } from '~/server/utils/activeProject'
import { getInteractionAccess, canEditNegotiation } from '~/server/utils/projectPermissions'

export default defineEventHandler(async (event) => {
  const session = await requireAuth(event)
  const globalRecordId = getRouterParam(event, 'id')!
  const scope = await getActiveScope(event)
  const projectId = scope.project?.id

  if (!projectId) {
    throw createError({ statusCode: 400, message: 'No active project context' })
  }

  const body = await readBody(event)
  const { negotiationStatus, addAssigneeId, removeAssigneeId } = body

  if (negotiationStatus !== undefined) {
    const canEdit = await canEditNegotiation(session.id, projectId, globalRecordId)
    if (!canEdit) {
      throw createError({ statusCode: 403, message: 'Nemáte oprávnění editovat stav tohoto partnera. Nejste přiřazeni k tomuto partnerovi.' })
    }
    await prisma.negotiation.upsert({
      where: { projectId_globalRecordId: { projectId, globalRecordId } },
      create: { projectId, globalRecordId, negotiationStatus },
      update: { negotiationStatus },
    })
  }

  if (addAssigneeId !== undefined || (removeAssigneeId !== undefined && removeAssigneeId !== session.id)) {
    const access = await getInteractionAccess(session.id, projectId)
    if (!access.canEditAll && !access.isAdmin) {
      throw createError({ statusCode: 403, message: 'Přiřazování partnerů je vyhrazeno pro vedení obchodu.' })
    }
  }

  if (addAssigneeId) {
    const assigneeExists = await prisma.user.findUnique({ where: { id: addAssigneeId }, select: { id: true } })
    if (!assigneeExists) throw createError({ statusCode: 400, message: 'Uživatel nenalezen.' })

    await prisma.negotiationAssignee.upsert({
      where: { projectId_globalRecordId_userId: { projectId, globalRecordId, userId: addAssigneeId } },
      create: { projectId, globalRecordId, userId: addAssigneeId, assignedById: session.id },
      update: {},
    })
  }

  if (removeAssigneeId) {
    await prisma.negotiationAssignee.deleteMany({
      where: { projectId, globalRecordId, userId: removeAssigneeId },
    })
  }

  return { success: true }
})
