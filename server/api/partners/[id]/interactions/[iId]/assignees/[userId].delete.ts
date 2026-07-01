import { prisma } from '~/server/utils/prisma'
import { requireInteractionAccess } from '~/server/utils/projectPermissions'

export default defineEventHandler(async (event) => {
  const iId = getRouterParam(event, 'iId')!
  const userId = getRouterParam(event, 'userId')!
  const { access } = await requireInteractionAccess(event, iId, 'edit')

  if (!access.canEditAll && !access.isAdmin) {
    throw createError({ statusCode: 403, message: 'Správu přiřazených uživatelů k záznamu smí provádět pouze vedení obchodu.' })
  }

  await prisma.interactionAssignee.delete({
    where: { interactionId_userId: { interactionId: iId, userId } },
  })
  return { ok: true }
})
