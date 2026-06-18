import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'
import { getActiveScope } from '~/server/utils/activeProject'
import { getInteractionAccess } from '~/server/utils/projectPermissions'

export default defineEventHandler(async (event) => {
  const session = await requireAuth(event)
  const globalRecordId = getRouterParam(event, 'id')!
  const scope = await getActiveScope(event)
  const projectId = scope.project?.id

  if (!projectId) {
    throw createError({ statusCode: 400, statusMessage: 'Není vybrán žádný projekt.' })
  }

  const body = await readBody<{
    type: 'NOTE' | 'EMAIL' | 'FULFILLMENT'
    content?: string
    actionStatus?: string
    dealStage?: string
    direction?: 'SENT' | 'RECEIVED'
    subject?: string
    sentAt?: string
    fromAddress?: string
    toAddress?: string
    gmailId?: string
    myToThem?: string
    themToUs?: string
    assigneeIds?: string[]
  }>(event)

  if (!body.type) {
    throw createError({ statusCode: 400, statusMessage: 'Typ jednání je povinný.' })
  }

  if (body.type === 'NOTE' && !body.content?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Obsah poznámky je povinný.' })
  }

  if (body.type === 'EMAIL') {
    if (!body.subject?.trim()) throw createError({ statusCode: 400, statusMessage: 'Předmět je povinný.' })
    if (!body.sentAt) throw createError({ statusCode: 400, statusMessage: 'Datum odeslání je povinné.' })
    if (!body.direction) throw createError({ statusCode: 400, statusMessage: 'Směr je povinný.' })
  }

  const access = await getInteractionAccess(session.id, projectId)
  const assigneeIds = body.assigneeIds ?? []

  // Auto-add creator as assignee if they don't have edit_all and aren't already in the list
  if (!access.canEditAll && !access.isAdmin && !assigneeIds.includes(session.id)) {
    assigneeIds.push(session.id)
  }

  const interaction = await prisma.interaction.create({
    data: {
      globalRecordId,
      projectId,
      type: body.type,
      actionStatus: body.actionStatus as any ?? null,
      dealStage: body.dealStage as any ?? null,
      content: body.content?.trim() ?? null,
      createdBy: session.id,
      direction: body.type === 'EMAIL' ? body.direction as any : null,
      subject: body.type === 'EMAIL' ? body.subject?.trim() ?? null : null,
      sentAt: body.type === 'EMAIL' && body.sentAt ? new Date(body.sentAt) : null,
      fromAddress: body.type === 'EMAIL' ? body.fromAddress?.trim() ?? null : null,
      toAddress: body.type === 'EMAIL' ? body.toAddress?.trim() ?? null : null,
      gmailId: body.type === 'EMAIL' ? body.gmailId ?? null : null,
      myToThem: body.type === 'FULFILLMENT' ? body.myToThem ?? null : null,
      themToUs: body.type === 'FULFILLMENT' ? body.themToUs ?? null : null,
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
      project: { select: { id: true, name: true } },
    },
  })

  return interaction
})
