import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const globalRecordId = getRouterParam(event, 'id')!
  const { userId } = await readBody(event)

  if (!userId) throw createError({ statusCode: 400, statusMessage: 'userId required' })

  return prisma.partnerAssignment.upsert({
    where: { globalRecordId_userId: { globalRecordId, userId } },
    create: { globalRecordId, userId },
    update: {},
    include: { user: { select: { id: true, name: true, image: true } } },
  })
})
