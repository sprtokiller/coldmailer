import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'
import { getActiveGroupId } from '~/server/utils/activeProject'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const globalRecordId = getRouterParam(event, 'id')!
  const groupId = await getActiveGroupId(event)

  if (!groupId) return { blacklist: [], emailDisplayMode: 'text' }

  const fulfillment = await prisma.partnerFulfillment.findUnique({
    where: { globalRecordId_groupId: { globalRecordId, groupId } },
    select: { contactBlacklist: true, emailDisplayMode: true },
  })

  return {
    blacklist: Array.isArray(fulfillment?.contactBlacklist)
      ? (fulfillment.contactBlacklist as string[])
      : [],
    emailDisplayMode: fulfillment?.emailDisplayMode ?? 'text',
  }
})
