import { prisma } from '~/server/utils/prisma'
import { requireEmailAccess } from '~/server/utils/projectPermissions'

export default defineEventHandler(async (event) => {
  const emailId = getRouterParam(event, 'emailId')!
  const { session, email } = await requireEmailAccess(event, emailId, 'edit')

  const body = await readBody<{
    content?: string | null
    direction?: 'SENT' | 'RECEIVED'
    subject?: string
    sentAt?: string
    fromAddress?: string | null
    toAddress?: string | null
  }>(event)

  const data: Record<string, any> = {}

  // If someone other than the creator edits, add them as a co-author (EmailAssignee)
  const isCreator = email.createdBy === session.id
  const isAlreadyAssignee = email.assignees.some(a => a.userId === session.id)
  if (!isCreator && !isAlreadyAssignee) {
    data.assignees = { create: { userId: session.id } }
  }

  if (body.content !== undefined) data.content = body.content?.trim() || null
  if (body.direction !== undefined) data.direction = body.direction
  if (body.subject !== undefined) data.subject = body.subject?.trim() || null
  if (body.sentAt !== undefined) data.sentAt = body.sentAt ? new Date(body.sentAt) : null
  if (body.fromAddress !== undefined) data.fromAddress = body.fromAddress?.trim() || null
  if (body.toAddress !== undefined) data.toAddress = body.toAddress?.trim() || null

  return prisma.email.update({
    where: { id: emailId },
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
