import { prisma } from '~/server/utils/prisma'
import { requireNoteAccess } from '~/server/utils/projectPermissions'

export default defineEventHandler(async (event) => {
  const noteId = getRouterParam(event, 'noteId')!
  const { session, note, access } = await requireNoteAccess(event, noteId, 'view')

  if (note.createdBy !== session.id && !access.isAdmin) {
    throw createError({ statusCode: 403, message: 'Smazat smí pouze autor nebo administrátor.' })
  }

  await prisma.note.delete({ where: { id: noteId } })
  return { ok: true }
})
