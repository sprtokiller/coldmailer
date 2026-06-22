import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'
import { syncGmailForUser } from '~/server/utils/gmail-sync'

const DEBOUNCE_MS = 30_000

export default defineEventHandler(async (event) => {
  const session = await requireAuth(event)

  try {
    const user = await prisma.user.findUnique({
      where: { id: session.id },
      select: { lastGmailSync: true, accessToken: true },
    })

    if (!user?.accessToken) {
      return { synced: 0, skipped: 'no-token' }
    }

    if (user.lastGmailSync && Date.now() - user.lastGmailSync.getTime() < DEBOUNCE_MS) {
      return { synced: 0, skipped: 'debounced' }
    }

    return await syncGmailForUser(session.id)
  } catch (e: any) {
    if (e?.statusCode === 401 || e?.statusCode === 403 || e?.status === 401 || e?.status === 403) {
      console.warn(`[gmail-sync] Auth error for user ${session.id}:`, e.message ?? e)
      return { synced: 0, skipped: 'auth-error' }
    }
    console.error(`[gmail-sync] Sync failed for user ${session.id}:`, e)
    return { synced: 0, skipped: 'error' }
  }
})
