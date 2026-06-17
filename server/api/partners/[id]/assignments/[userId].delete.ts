import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const globalRecordId = getRouterParam(event, 'id')!
  const userId = getRouterParam(event, 'userId')!

  await prisma.partnerAssignment.delete({
    where: { globalRecordId_userId: { globalRecordId, userId } },
  })
  return { ok: true }
})
