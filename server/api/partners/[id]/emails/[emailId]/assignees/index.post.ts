import { prisma } from '~/server/utils/prisma'
import { requireEmailAccess } from '~/server/utils/projectPermissions'

export default defineEventHandler(async (event) => {
  const emailId = getRouterParam(event, 'emailId')!
  const { access } = await requireEmailAccess(event, emailId, 'edit')

  if (!access.canEditAll && !access.isAdmin) {
    throw createError({ statusCode: 403, message: 'Správu přiřazených uživatelů k záznamu smí provádět pouze vedení obchodu.' })
  }

  const { userId } = await readBody<{ userId: string }>(event)
  if (!userId) throw createError({ statusCode: 400, message: 'userId je povinné' })

  return prisma.emailAssignee.upsert({
    where: { emailId_userId: { emailId, userId } },
    create: { emailId, userId },
    update: {},
    include: { user: { select: { id: true, name: true, image: true } } },
  })
})
