import { prisma } from '~/server/utils/prisma'
import { requireNoteAccess } from '~/server/utils/projectPermissions'

export default defineEventHandler(async (event) => {
  const noteId = getRouterParam(event, 'noteId')!
  const userId = getRouterParam(event, 'userId')!
  const { access } = await requireNoteAccess(event, noteId, 'edit')

  if (!access.canEditAll && !access.isAdmin) {
    throw createError({ statusCode: 403, message: 'Správu přiřazených uživatelů k záznamu smí provádět pouze vedení obchodu.' })
  }

  await prisma.noteAssignee.delete({
    where: { noteId_userId: { noteId, userId } },
  })
  return { ok: true }
})
