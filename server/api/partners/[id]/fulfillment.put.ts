import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'
import { getActiveGroupId } from '~/server/utils/activeGroup'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const globalRecordId = getRouterParam(event, 'id')!
  const groupId = await getActiveGroupId(event)
  const { myToThem, themToUs } = await readBody(event)

  return prisma.partnerFulfillment.upsert({
    where: { globalRecordId_groupId: { globalRecordId, groupId: groupId ?? '' } },
    create: { globalRecordId, groupId, myToThem: myToThem ?? null, themToUs: themToUs ?? null },
    update: { myToThem: myToThem ?? null, themToUs: themToUs ?? null },
  })
})
