import { prisma } from '~/server/utils/prisma'
import { getScheduledEmailListAccess } from '~/server/utils/scheduled-email-access'

export default defineEventHandler(async (event) => {
  const globalRecordId = getRouterParam(event, 'id')!
  const { projectId, canView } = await getScheduledEmailListAccess(event, globalRecordId)

  if (!projectId || !canView) return []

  return prisma.scheduledEmail.findMany({
    where: { projectId, globalRecordId, status: { in: ['PENDING', 'SENDING', 'FAILED'] } },
    include: { createdBy: { select: { id: true, name: true, image: true } } },
    orderBy: { scheduledFor: 'asc' },
  })
})
