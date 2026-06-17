import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const globalRecordId = getRouterParam(event, 'id')!
  const { myToThem, themToUs } = await readBody(event)

  return prisma.partnerFulfillment.upsert({
    where: { globalRecordId },
    create: { globalRecordId, myToThem: myToThem ?? null, themToUs: themToUs ?? null },
    update: { myToThem: myToThem ?? null, themToUs: themToUs ?? null },
  })
})
