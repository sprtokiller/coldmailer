import { prisma } from '~/server/utils/prisma'
import { requireInteractionAccess } from '~/server/utils/projectPermissions'

export default defineEventHandler(async (event) => {
  const iId = getRouterParam(event, 'iId')!
  const { access } = await requireInteractionAccess(event, iId, 'edit')

  if (!access.canEditAll && !access.isAdmin) {
    throw createError({ statusCode: 403, message: 'Správu přiřazených uživatelů k záznamu smí provádět pouze vedení obchodu.' })
  }

  const { userId } = await readBody<{ userId: string }>(event)
  if (!userId) throw createError({ statusCode: 400, message: 'userId je povinné' })

  return prisma.interactionAssignee.upsert({
    where: { interactionId_userId: { interactionId: iId, userId } },
    create: { interactionId: iId, userId },
    update: {},
    include: { user: { select: { id: true, name: true, image: true } } },
  })
})
