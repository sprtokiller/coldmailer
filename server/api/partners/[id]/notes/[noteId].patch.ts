import { prisma } from '~/server/utils/prisma'
import { requireNoteAccess } from '~/server/utils/projectPermissions'

export default defineEventHandler(async (event) => {
  const noteId = getRouterParam(event, 'noteId')!
  const { session, note } = await requireNoteAccess(event, noteId, 'edit')

  const body = await readBody<{ content?: string }>(event)
  const data: Record<string, any> = {}

  // If someone other than the creator edits, add them as a co-author (NoteAssignee)
  const isCreator = note.createdBy === session.id
  const isAlreadyAssignee = note.assignees.some(a => a.userId === session.id)
  if (!isCreator && !isAlreadyAssignee) {
    data.assignees = { create: { userId: session.id } }
  }

  if (body.content !== undefined) {
    if (!body.content.trim()) throw createError({ statusCode: 400, message: 'Obsah poznámky je povinný.' })
    data.content = body.content.trim()
  }

  return prisma.note.update({
    where: { id: noteId },
    data,
    include: {
      creator: { select: { id: true, name: true, image: true } },
      assignees: {
        select: {
          userId: true,
          user: { select: { id: true, name: true, image: true } },
        },
      },
    },
  })
})
