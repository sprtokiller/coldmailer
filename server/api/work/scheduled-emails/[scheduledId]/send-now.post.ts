/**
 * POST /api/work/scheduled-emails/[scheduledId]/send-now
 *
 * Okamžité odeslání naplánovaného e-mailu ze záložky Práce. Na rozdíl od
 * partnerského endpointu neváže na aktivní projekt — autorizuje autora
 * e-mailu nebo admina, takže funguje napříč projekty.
 */
import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'
import { trySendScheduledEmail } from '~/server/utils/scheduled-email-sender'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const scheduledId = getRouterParam(event, 'scheduledId')!

  const existing = await prisma.scheduledEmail.findUnique({ where: { id: scheduledId } })
  if (!existing || (!user.isAdmin && existing.createdById !== user.id)) {
    throw createError({ statusCode: 404, message: 'Naplánovaný e-mail nenalezen.' })
  }
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
