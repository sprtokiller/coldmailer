import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const cId = getRouterParam(event, 'cId')!

  await prisma.partnerContact.delete({ where: { id: cId } })
  return { ok: true }
})
