import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'
import { getActiveScope } from '~/server/utils/activeProject'
import { getInteractionAccess } from '~/server/utils/projectPermissions'

export default defineEventHandler(async (event) => {
  const session = await requireAuth(event)
  const globalRecordId = getRouterParam(event, 'id')!
  const userId = getRouterParam(event, 'userId')!
  const scope = await getActiveScope(event)
  const projectId = scope.project?.id

  if (!projectId) {
    throw createError({ statusCode: 400, message: 'Není vybrán žádný projekt.' })
  }

  const access = await getInteractionAccess(session.id, projectId)
  if (!access.canEditAll && !access.isAdmin) {
    throw createError({ statusCode: 403, message: 'Správu přiřazených uživatelů k záznamu smí provádět pouze vedení obchodu.' })
  }

  const negotiation = await prisma.negotiation.findUnique({
    where: { projectId_globalRecordId: { projectId, globalRecordId } },
    select: { id: true },
  })
  if (!negotiation) {
    throw createError({ statusCode: 404, message: 'Jednání nebylo nalezeno.' })
  }

  await prisma.fulfillmentAssignee.delete({
    where: { negotiationId_userId: { negotiationId: negotiation.id, userId } },
  })
  return { ok: true }
})
