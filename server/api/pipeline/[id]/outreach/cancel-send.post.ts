import { requireAuth } from '~/server/utils/requireAuth'
import { cancelOutreachSend } from '~/server/utils/outreach-scheduler'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const body = await readBody<{ scheduledId: string }>(event)

  if (!body.scheduledId) {
    throw createError({ statusCode: 400, statusMessage: 'scheduledId je povinný.' })
  }

  const cancelled = cancelOutreachSend(body.scheduledId, user.id)
  return { cancelled }
})
