import { prisma } from '~/server/utils/prisma'
import { requireAdmin } from '~/server/utils/permissions'
import { syncGmailForUser } from '~/server/utils/gmail-sync'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const userId = getRouterParam(event, 'id')!

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { accessToken: true } })
  if (!user?.accessToken) {
    return { synced: 0, skipped: 'no-token' }
  }

  return await syncGmailForUser(userId)
})
