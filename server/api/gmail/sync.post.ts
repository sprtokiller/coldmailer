import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'
import { syncGmailForUser } from '~/server/utils/gmail-sync'

const DEBOUNCE_MS = 10_000

export default defineEventHandler(async (event) => {
  const session = await requireAuth(event)
  const body = await readBody(event).catch(() => ({})) as { lookbackDays?: number } | null

  try {
    const user = await prisma.user.findUnique({
      where: { id: session.id },
      select: { lastGmailSync: true, accessToken: true },
    })

    if (!user?.accessToken) {
      return { synced: 0, skipped: 'no-token' }
    }

    const forceLookbackDays = body?.lookbackDays && body.lookbackDays > 0 ? body.lookbackDays : undefined

    if (!forceLookbackDays && user.lastGmailSync && Date.now() - user.lastGmailSync.getTime() < DEBOUNCE_MS) {
      return { synced: 0, skipped: 'debounced' }
    }

    return await syncGmailForUser(session.id, forceLookbackDays ? { forceLookbackDays } : undefined)
  } catch (e: any) {
    if (e?.statusCode === 401 || e?.statusCode === 403 || e?.status === 401 || e?.status === 403) {
      console.warn(`[gmail-sync] Auth error for user ${session.id}:`, e.message ?? e)
      return { synced: 0, skipped: 'auth-error' }
    }
    console.error(`[gmail-sync] Sync failed for user ${session.id}:`, e)
    return { synced: 0, skipped: 'error' }
  }
})

