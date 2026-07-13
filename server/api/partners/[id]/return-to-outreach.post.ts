import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'
import { getActiveScope } from '~/server/utils/activeProject'
import { canEditNegotiation } from '~/server/utils/projectPermissions'

export default defineEventHandler(async (event) => {
  const session = await requireAuth(event)
  const globalRecordId = getRouterParam(event, 'id')!
  const scope = await getActiveScope(event)
  const projectId = scope.project?.id

  if (!projectId) {
    throw createError({ statusCode: 400, message: 'No active project context' })
  }

  const canEdit = await canEditNegotiation(session.id, projectId, globalRecordId)
  if (!canEdit) {
    throw createError({ statusCode: 403, message: 'Nemáte oprávnění editovat stav tohoto partnera. Nejste přiřazeni k tomuto partnerovi.' })
  }

  await prisma.negotiation.upsert({
    where: { projectId_globalRecordId: { projectId, globalRecordId } },
    create: { projectId, globalRecordId, negotiationStatus: 'PRED_OSLOVENIM' },
    update: { negotiationStatus: 'PRED_OSLOVENIM' },
  })

  return { success: true, projectId }
})
