import { prisma } from '~/server/utils/prisma'
import { requireScheduledEmailAccess } from '~/server/utils/scheduled-email-access'
import { trySendScheduledEmail } from '~/server/utils/scheduled-email-sender'

export default defineEventHandler(async (event) => {
  const { scheduledId, existing } = await requireScheduledEmailAccess(event)

  if (existing.status !== 'PENDING' && existing.status !== 'FAILED') {
    throw createError({ statusCode: 400, message: 'Tento e-mail už není ve frontě k odeslání.' })
  }

  const claimed = await trySendScheduledEmail(scheduledId)
  if (!claimed) {
    throw createError({ statusCode: 409, message: 'Tento e-mail se právě odesílá.' })
  }

  const updated = await prisma.scheduledEmail.findUnique({ where: { id: scheduledId } })
  if (updated?.status === 'FAILED') {
    throw createError({ statusCode: 500, message: updated.errorMessage ?? 'Odeslání selhalo.' })
  }

  return updated
})
