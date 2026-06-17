import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const globalRecordId = getRouterParam(event, 'id')!
  const { direction, subject, body, sentAt, fromAddress, toAddress, gmailId } = await readBody(event)

  if (!direction || !subject || !sentAt) {
    throw createError({ statusCode: 400, statusMessage: 'direction, subject, sentAt required' })
  }

  return prisma.partnerMailEvent.create({
    data: {
      globalRecordId,
      direction,
      subject,
      body: body || null,
      sentAt: new Date(sentAt),
      fromAddress: fromAddress || null,
      toAddress: toAddress || null,
      gmailId: gmailId || null,
      createdBy: user.id,
    },
    include: { creator: { select: { id: true, name: true, image: true } } },
  })
})
