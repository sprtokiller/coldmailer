import { prisma } from '~/server/utils/prisma'
import { trySendScheduledEmail } from '~/server/utils/scheduled-email-sender'

const POLL_INTERVAL_MS = 30_000

export default defineNitroPlugin(() => {
  const timer = setInterval(async () => {
    try {
      const due = await prisma.scheduledEmail.findMany({
        where: { status: 'PENDING', scheduledFor: { lte: new Date() } },
        select: { id: true },
      })
      for (const email of due) {
        await trySendScheduledEmail(email.id)
      }
    } catch (err) {
      console.error('[scheduled-email-poller] error:', err)
    }
  }, POLL_INTERVAL_MS)
  timer.unref?.()
})
