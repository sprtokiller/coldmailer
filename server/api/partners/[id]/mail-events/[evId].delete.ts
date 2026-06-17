import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const evId = getRouterParam(event, 'evId')!

  await prisma.partnerMailEvent.delete({ where: { id: evId } })
  return { ok: true }
})
