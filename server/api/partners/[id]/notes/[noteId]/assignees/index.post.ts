import { prisma } from '~/server/utils/prisma'
import { requireNoteAccess } from '~/server/utils/projectPermissions'

export default defineEventHandler(async (event) => {
  const noteId = getRouterParam(event, 'noteId')!
  const { access } = await requireNoteAccess(event, noteId, 'edit')

  if (!access.canEditAll && !access.isAdmin) {
    throw createError({ statusCode: 403, message: 'Správu přiřazených uživatelů k záznamu smí provádět pouze vedení obchodu.' })
  }

  const { userId } = await readBody<{ userId: string }>(event)
  if (!userId) throw createError({ statusCode: 400, message: 'userId je povinné' })

  return prisma.noteAssignee.upsert({
    where: { noteId_userId: { noteId, userId } },
    create: { noteId, userId },
    update: {},
    include: { user: { select: { id: true, name: true, image: true } } },
  })
})
