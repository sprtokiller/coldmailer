import { prisma } from '~/server/utils/prisma'
import { trySendScheduledEmail } from '~/server/utils/scheduled-email-sender'
import { hasRunningWorkByRef } from '~/server/utils/work-registry'

const POLL_INTERVAL_MS = 30_000
const RESTART_ERROR_MESSAGE = 'Odesílání bylo přerušeno (restart serveru). Zkuste odeslat znovu.'

/**
 * Rows stuck in SENDING whose send isn't actually running in this process are
 * leftovers from a crash/restart mid-send (the app runs as a single instance).
 * Without this they'd be frozen forever — the poller only picks up PENDING and
 * the claim only takes PENDING/FAILED. Mark them FAILED so the user can retry.
 */
async function recoverOrphanedSending(): Promise<void> {
  const sending = await prisma.scheduledEmail.findMany({
    where: { status: 'SENDING' },
    select: { id: true },
  })
  for (const row of sending) {
    if (hasRunningWorkByRef('SCHEDULED_EMAIL', row.id)) continue
    await prisma.scheduledEmail.updateMany({
      where: { id: row.id, status: 'SENDING' },
      data: { status: 'FAILED', errorMessage: RESTART_ERROR_MESSAGE },
    })
    console.warn(`[scheduled-email-poller] recovered orphaned SENDING e-mail ${row.id}`)
  }
}

export default defineNitroPlugin(() => {
  const timer = setInterval(async () => {
    try {
      await recoverOrphanedSending()

      const due = await prisma.scheduledEmail.findMany({
        where: { status: 'PENDING', scheduledFor: { lte: new Date() } },
        select: { id: true, createdById: true },
        orderBy: { scheduledFor: 'asc' },
      })
      if (due.length === 0) return

      // Different users' sends are independent — run them in parallel so one
      // slow Gmail call doesn't delay everyone. Within a user stay sequential
      // (one Gmail account, keeps token refresh and rate limits sane).
      const byUser = new Map<string, string[]>()
      for (const email of due) {
        const ids = byUser.get(email.createdById) ?? []
        ids.push(email.id)
        byUser.set(email.createdById, ids)
      }
      await Promise.all([...byUser.values()].map(async (ids) => {
        for (const id of ids) {
          try {
            await trySendScheduledEmail(id)
          } catch (err) {
            console.error(`[scheduled-email-poller] send ${id} failed:`, err)
          }
        }
      }))
    } catch (err) {
      console.error('[scheduled-email-poller] error:', err)
    }
  }, POLL_INTERVAL_MS)
  timer.unref?.()
})
