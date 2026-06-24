import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'
import { getActiveGroupId } from '~/server/utils/activeProject'
import { syncGmailForPartnerEmail, getEmailSyncHistoryDays } from '~/server/utils/gmail-sync'

export default defineEventHandler(async (event) => {
  const session = await requireAuth(event)
  const globalRecordId = getRouterParam(event, 'id')!
  const groupId = await getActiveGroupId(event)
  const body = await readBody<{
    action: 'dismiss' | 'blacklist' | 'add_contact'
    email: string
    firstName?: string
    lastName?: string
    role?: string
    contactType?: string
  }>(event)

  if (!body.email || !body.action) {
    throw createError({ statusCode: 400, statusMessage: 'email and action are required' })
  }

  const email = body.email.trim().toLowerCase()

  if (body.action === 'dismiss') {
    await prisma.interaction.deleteMany({
      where: {
        globalRecordId,
        isUnknownContact: true,
        unknownContactAddress: email,
      },
    })
    return { ok: true }
  }

  if (body.action === 'blacklist') {
    await prisma.interaction.deleteMany({
      where: {
        globalRecordId,
        isUnknownContact: true,
        unknownContactAddress: email,
      },
    })

    if (groupId) {
      const fulfillment = await prisma.partnerFulfillment.findUnique({
        where: { globalRecordId_groupId: { globalRecordId, groupId } },
        select: { contactBlacklist: true },
      })

      const existing = Array.isArray(fulfillment?.contactBlacklist)
        ? (fulfillment.contactBlacklist as string[])
        : []

      if (!existing.includes(email)) {
        await prisma.partnerFulfillment.upsert({
          where: { globalRecordId_groupId: { globalRecordId, groupId } },
          create: { globalRecordId, groupId, contactBlacklist: [...existing, email] },
          update: { contactBlacklist: [...existing, email] },
        })
      }
    }

    return { ok: true }
  }

  if (body.action === 'add_contact') {
    await prisma.partnerContact.upsert({
      where: { globalRecordId_address: { globalRecordId, address: email } },
      create: {
        globalRecordId,
        address: email,
        firstName: body.firstName || null,
        lastName: body.lastName || null,
        role: body.role || null,
        contactType: body.contactType || null,
      },
      update: {
        firstName: body.firstName || undefined,
        lastName: body.lastName || undefined,
        role: body.role || undefined,
        contactType: body.contactType || undefined,
      },
    })

    await prisma.interaction.updateMany({
      where: {
        globalRecordId,
        isUnknownContact: true,
        unknownContactAddress: email,
      },
      data: {
        isUnknownContact: false,
        unknownContactAddress: null,
      },
    })

    getEmailSyncHistoryDays().then(historyDays =>
      syncGmailForPartnerEmail(session.id, globalRecordId, email, historyDays)
        .catch(err => console.warn('[gmail-sync] Targeted sync failed:', err.message ?? err)),
    )

    return { ok: true }
  }

  throw createError({ statusCode: 400, statusMessage: 'Invalid action' })
})
