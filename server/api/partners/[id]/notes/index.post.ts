import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'
import { getActiveScope } from '~/server/utils/activeProject'
import { canEditNegotiation } from '~/server/utils/projectPermissions'

export default defineEventHandler(async (event) => {
  const session = await requireAuth(event)
  const globalRecordId = getRouterParam(event, 'id')!
  const scope = await getActiveScope(event)
  const projectId = scope.project?.id

  if (!projectId) {
    throw createError({ statusCode: 400, message: 'Není vybrán žádný projekt.' })
  }

  const body = await readBody<{ content: string; assigneeIds?: string[] }>(event)
  if (!body.content?.trim()) {
    throw createError({ statusCode: 400, message: 'Obsah poznámky je povinný.' })
  }

  const canEdit = await canEditNegotiation(session.id, projectId, globalRecordId)
  if (!canEdit) {
    throw createError({ statusCode: 403, message: 'Nemáte oprávnění vytvořit záznam jednání. Nejste přiřazeni k tomuto partnerovi.' })
  }

  const negotiation = await prisma.negotiation.upsert({
    where: { projectId_globalRecordId: { projectId, globalRecordId } },
    create: { projectId, globalRecordId },
    update: {},
  })

  const assigneeIds = body.assigneeIds ?? []

  return prisma.note.create({
    data: {
      negotiationId: negotiation.id,
      content: body.content.trim(),
      createdBy: session.id,
      assignees: assigneeIds.length > 0
        ? { create: assigneeIds.map(userId => ({ userId })) }
        : undefined,
    },
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
