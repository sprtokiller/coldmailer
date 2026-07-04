import { prisma } from '~/server/utils/prisma'
import { requireScheduledEmailAccess } from '~/server/utils/scheduled-email-access'

export default defineEventHandler(async (event) => {
  const { scheduledId } = await requireScheduledEmailAccess(event)

  const cancelled = await prisma.scheduledEmail.updateMany({
    where: { id: scheduledId, status: { in: ['PENDING', 'FAILED'] } },
    data: { status: 'CANCELLED' },
  })
  if (cancelled.count === 0) {
    throw createError({ statusCode: 400, message: 'Tento e-mail už není možné zrušit — právě se odesílá nebo už byl odeslán.' })
  }

  return { ok: true }
})
