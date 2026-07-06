import { prisma } from '~/server/utils/prisma'
import { requireEmailAccess } from '~/server/utils/projectPermissions'

export default defineEventHandler(async (event) => {
  const emailId = getRouterParam(event, 'emailId')!
  const userId = getRouterParam(event, 'userId')!
  const { access } = await requireEmailAccess(event, emailId, 'edit')

  if (!access.canEditAll && !access.isAdmin) {
    throw createError({ statusCode: 403, message: 'Správu přiřazených uživatelů k záznamu smí provádět pouze vedení obchodu.' })
  }

  await prisma.emailAssignee.delete({
    where: { emailId_userId: { emailId, userId } },
  })
  return { ok: true }
})
