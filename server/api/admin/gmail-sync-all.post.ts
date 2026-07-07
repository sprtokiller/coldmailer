import { requireAdmin } from '~/server/utils/permissions'
import { syncGmailForAllUsers } from '~/server/utils/gmail-sync'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  return await syncGmailForAllUsers()
})
