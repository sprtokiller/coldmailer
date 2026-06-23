import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'
import { syncGmailForPartnerEmail, getEmailSyncHistoryDays } from '~/server/utils/gmail-sync'

export default defineEventHandler(async (event) => {
  const session = await requireAuth(event)
  const globalRecordId = getRouterParam(event, 'id')!
  const { address, label, isPrimary } = await readBody(event)

  if (!address) throw createError({ statusCode: 400, statusMessage: 'address required' })

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(address)) {
    throw createError({ statusCode: 400, statusMessage: 'invalid email format' })
  }

  if (isPrimary) {
    await prisma.partnerContact.updateMany({
      where: { globalRecordId },
      data: { isPrimary: false },
    })
  }

  const contact = await prisma.partnerContact.create({
    data: { globalRecordId, address, label: label || null, isPrimary: !!isPrimary },
  })

  const record = await prisma.globalRecord.findUnique({ where: { id: globalRecordId } })
  if (record && typeof record.payload === 'object' && record.payload !== null) {
    const payload = record.payload as Record<string, any>
    const emails = Array.isArray(payload.emails) ? payload.emails : (payload.email ? [payload.email] : [])
    if (!emails.includes(address)) {
      await prisma.globalRecord.update({
        where: { id: globalRecordId },
        data: { payload: { ...payload, email: address, emails: [...emails, address] } }
      })
    }
  }

  getEmailSyncHistoryDays().then(historyDays =>
    syncGmailForPartnerEmail(session.id, globalRecordId, address, historyDays)
      .catch(err => console.warn('[gmail-sync] Targeted sync failed:', err.message ?? err)),
  )

  return contact
})
