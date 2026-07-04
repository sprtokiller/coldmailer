import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'
import { syncGmailForUser } from '~/server/utils/gmail-sync'
import { hasRunningWork, runWork } from '~/server/utils/work-registry'

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

    // Server-side zámek: víc otevřených tabů (layout + outreach stránky) spouští
    // vlastní intervaly — souběžné synchronizace stejného uživatele nemají smysl.
    if (hasRunningWork('GMAIL_SYNC', session.id)) {
      return { synced: 0, skipped: 'in-progress' }
    }

    return await runWork(
      {
        kind: 'GMAIL_SYNC',
        label: forceLookbackDays
          ? `Synchronizace Gmailu (${forceLookbackDays} dní zpětně)`
          : 'Synchronizace Gmailu',
        userId: session.id,
        cancellable: true,
      },
      handle => syncGmailForUser(session.id, {
        ...(forceLookbackDays ? { forceLookbackDays } : {}),
        signal: handle.signal,
        onProgress: (processed, synced) =>
          handle.setProgress(processed, null, `${processed} zpráv zkontrolováno, ${synced} nových`),
      }),
    )
  } catch (e: any) {
    if (e?.statusCode === 401 || e?.statusCode === 403 || e?.status === 401 || e?.status === 403) {
      console.warn(`[gmail-sync] Auth error for user ${session.id}:`, e.message ?? e)
      return { synced: 0, skipped: 'auth-error' }
    }
    console.error(`[gmail-sync] Sync failed for user ${session.id}:`, e)
    return { synced: 0, skipped: 'error' }
  }
})

