/**
 * POST /api/work/scheduled-emails/[scheduledId]/cancel
 *
 * Zrušení naplánovaného e-mailu ze záložky Práce (autor nebo admin,
 * nezávisle na aktivním projektu).
 */
import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const scheduledId = getRouterParam(event, 'scheduledId')!

  const existing = await prisma.scheduledEmail.findUnique({ where: { id: scheduledId } })
  if (!existing || (!user.isAdmin && existing.createdById !== user.id)) {
    throw createError({ statusCode: 404, message: 'Naplánovaný e-mail nenalezen.' })
  }

  const cancelled = await prisma.scheduledEmail.updateMany({
    where: { id: scheduledId, status: { in: ['PENDING', 'FAILED'] } },
    data: { status: 'CANCELLED' },
  })
  if (cancelled.count === 0) {
    throw createError({ statusCode: 400, message: 'Tento e-mail už není možné zrušit — právě se odesílá nebo už byl odeslán.' })
  }

  return { ok: true }
})
