import { prisma } from '~/server/utils/prisma'
import { requireInteractionAccess } from '~/server/utils/projectPermissions'

export default defineEventHandler(async (event) => {
  const iId = getRouterParam(event, 'iId')!
  await requireInteractionAccess(event, iId, 'edit')

  const body = await readBody<{
    content?: string
    actionStatus?: string | null
    dealStage?: string | null
    direction?: 'SENT' | 'RECEIVED'
    subject?: string
    sentAt?: string
    fromAddress?: string | null
    toAddress?: string | null
    myToThem?: string | null
    themToUs?: string | null
  }>(event)

  const data: Record<string, any> = {}

  if (body.content !== undefined) data.content = body.content?.trim() || null
  if (body.actionStatus !== undefined) data.actionStatus = body.actionStatus
  if (body.dealStage !== undefined) data.dealStage = body.dealStage
  if (body.direction !== undefined) data.direction = body.direction
  if (body.subject !== undefined) data.subject = body.subject?.trim() || null
  if (body.sentAt !== undefined) data.sentAt = body.sentAt ? new Date(body.sentAt) : null
  if (body.fromAddress !== undefined) data.fromAddress = body.fromAddress?.trim() || null
  if (body.toAddress !== undefined) data.toAddress = body.toAddress?.trim() || null
  if (body.myToThem !== undefined) data.myToThem = body.myToThem
  if (body.themToUs !== undefined) data.themToUs = body.themToUs

  return prisma.interaction.update({
    where: { id: iId },
    data,
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
})
