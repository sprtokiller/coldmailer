import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'
import { syncGmailForPartnerEmail, getEmailSyncHistoryDays } from '~/server/utils/gmail-sync'

export default defineEventHandler(async (event) => {
  const session = await requireAuth(event)
  const globalRecordId = getRouterParam(event, 'id')!
  const { address, label, isPrimary } = await readBody(event)

  if (!address) throw createError({ statusCode: 400, statusMessage: 'address required' })

  if (isPrimary) {
    await prisma.partnerContact.updateMany({
      where: { globalRecordId },
      data: { isPrimary: false },
    })
  }

  const contact = await prisma.partnerContact.create({
    data: { globalRecordId, address, label: label || null, isPrimary: !!isPrimary },
  })

  getEmailSyncHistoryDays().then(historyDays =>
    syncGmailForPartnerEmail(session.id, globalRecordId, address, historyDays)
      .catch(err => console.warn('[gmail-sync] Targeted sync failed:', err.message ?? err)),
  )

  return contact
})
