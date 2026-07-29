import { syncGmailForUser } from '~/server/utils/gmail-sync'
import { prisma } from '~/server/utils/prisma'

const HOUR_MS = 60 * 60 * 1000
// When there are no eligible users, re-check after this delay instead of dividing by zero.
const IDLE_DELAY_MS = 5 * 60 * 1000

// Instead of syncing every user in one burst at the top of the hour, walk the
// list continuously: each tick syncs the single user whose mailbox is the most
// stale (oldest lastGmailSync), then schedules the next tick 1/N of an hour
// later. Over an hour that spreads all N users evenly, one per time slot, and
// self-balances as users are added or removed. The watermark lives in the DB
// (User.lastGmailSync), so a server restart resumes where it left off.
export default defineNitroPlugin(() => {
  let timer: ReturnType<typeof setTimeout> | undefined

  const scheduleNext = (delayMs: number) => {
    timer = setTimeout(tick, delayMs)
    timer.unref?.()
  }

  const tick = async () => {
    try {
      const users = await prisma.user.findMany({
        where: { accessToken: { not: null }, googleId: { not: 'system' } },
        // NULL (never synced) sorts first, then oldest lastGmailSync first.
        orderBy: { lastGmailSync: { sort: 'asc', nulls: 'first' } },
        select: { id: true },
      })

      if (users.length === 0) {
        scheduleNext(IDLE_DELAY_MS)
        return
      }

      const slotMs = HOUR_MS / users.length
      try {
        await syncGmailForUser(users[0].id)
      } catch (err) {
        console.error('[gmail-sync-hourly] user sync error:', err)
      }
      scheduleNext(slotMs)
    } catch (err) {
      console.error('[gmail-sync-hourly] tick error:', err)
      scheduleNext(IDLE_DELAY_MS)
    }
  }

  scheduleNext(IDLE_DELAY_MS)
})
