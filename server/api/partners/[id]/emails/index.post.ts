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

  const body = await readBody<{
    content?: string
    direction: 'SENT' | 'RECEIVED'
    subject: string
    sentAt: string
    fromAddress?: string
    toAddress?: string
    gmailId?: string
    assigneeIds?: string[]
  }>(event)

  if (!body.subject?.trim()) throw createError({ statusCode: 400, message: 'Předmět je povinný.' })
  if (!body.sentAt) throw createError({ statusCode: 400, message: 'Datum odeslání je povinné.' })
  if (!body.direction) throw createError({ statusCode: 400, message: 'Směr je povinný.' })

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

  return prisma.email.create({
    data: {
      negotiationId: negotiation.id,
      content: body.content?.trim() ?? null,
      createdBy: session.id,
      direction: body.direction,
      subject: body.subject.trim(),
      sentAt: new Date(body.sentAt),
      fromAddress: body.fromAddress?.trim() ?? null,
      toAddress: body.toAddress?.trim() ?? null,
      gmailId: body.gmailId ?? null,
      isRead: body.direction === 'SENT',
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
