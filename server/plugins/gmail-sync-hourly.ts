import { syncGmailForAllUsers } from '~/server/utils/gmail-sync'

const SYNC_INTERVAL_MS = 60 * 60 * 1000

export default defineNitroPlugin(() => {
  const timer = setInterval(async () => {
    try {
      await syncGmailForAllUsers()
    } catch (err) {
      console.error('[gmail-sync-hourly] error:', err)
    }
  }, SYNC_INTERVAL_MS)
  timer.unref?.()
})
