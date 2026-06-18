import { prisma } from '~/server/utils/prisma'
import { requireInteractionAccess } from '~/server/utils/projectPermissions'

export default defineEventHandler(async (event) => {
  const iId = getRouterParam(event, 'iId')!
  const userId = getRouterParam(event, 'userId')!
  await requireInteractionAccess(event, iId, 'edit')

  await prisma.interactionAssignee.delete({
    where: { interactionId_userId: { interactionId: iId, userId } },
  })
  return { ok: true }
})
