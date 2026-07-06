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
    throw createError({ statusCode: 400, message: 'Není vybrán žádný projekt.' })
  }

  const access = await getInteractionAccess(session.id, projectId)
  if (!access.canEditAll && !access.isAdmin) {
    throw createError({ statusCode: 403, message: 'Správu přiřazených uživatelů k záznamu smí provádět pouze vedení obchodu.' })
  }

  const { userId } = await readBody<{ userId: string }>(event)
  if (!userId) throw createError({ statusCode: 400, message: 'userId je povinné' })

  const negotiation = await prisma.negotiation.upsert({
    where: { projectId_globalRecordId: { projectId, globalRecordId } },
    create: { projectId, globalRecordId },
    update: {},
  })

  return prisma.fulfillmentAssignee.upsert({
    where: { negotiationId_userId: { negotiationId: negotiation.id, userId } },
    create: { negotiationId: negotiation.id, userId },
    update: {},
    include: { user: { select: { id: true, name: true, image: true } } },
  })
})
