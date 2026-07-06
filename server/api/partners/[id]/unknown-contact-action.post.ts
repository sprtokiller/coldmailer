import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'
import { getActiveProjectId } from '~/server/utils/activeProject'
import { syncGmailForPartnerEmail, getEmailSyncHistoryDays } from '~/server/utils/gmail-sync'
import { removeProjectAdditionalAddress, appendProjectAdditionalAddress } from '~/server/utils/project-additional-addresses'

export default defineEventHandler(async (event) => {
  const session = await requireAuth(event)
  const globalRecordId = getRouterParam(event, 'id')!
  const projectId = await getActiveProjectId(event)
  const body = await readBody<{
    action: 'blacklist' | 'save_local' | 'add_contact'
    email: string
    firstName?: string
    lastName?: string
    role?: string
    contactType?: string
    note?: string
  }>(event)

  if (!body.email || !body.action) {
    throw createError({ statusCode: 400, message: 'email and action are required' })
  }

  const email = body.email.trim().toLowerCase()

  if (body.action === 'save_local') {
    if (projectId) {
      await appendProjectAdditionalAddress(projectId, globalRecordId, email)
    }
    await prisma.email.updateMany({
      where: {
        negotiation: { globalRecordId },
        isUnknownContact: true,
        unknownContactAddress: email,
      },
      data: {
        isUnknownContact: false,
        unknownContactAddress: null,
      },
    })
    return { ok: true }
  }

  if (body.action === 'blacklist') {
    await prisma.email.deleteMany({
      where: {
        negotiation: { globalRecordId },
        isUnknownContact: true,
        unknownContactAddress: email,
      },
    })

    if (projectId) {
      await removeProjectAdditionalAddress(projectId, globalRecordId, email)

      const negotiation = await prisma.negotiation.upsert({
        where: { projectId_globalRecordId: { globalRecordId, projectId } },
        create: { globalRecordId, projectId },
        update: {},
      })

      await prisma.negotiationBlacklistedAddress.upsert({
        where: { negotiationId_address: { negotiationId: negotiation.id, address: email } },
        create: { negotiationId: negotiation.id, address: email },
        update: {},
      })
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
        note: body.note || null,
      },
      update: {
        firstName: body.firstName || undefined,
        lastName: body.lastName || undefined,
        role: body.role || undefined,
        contactType: body.contactType || undefined,
        note: body.note || undefined,
      },
    })

    if (projectId) {
      await removeProjectAdditionalAddress(projectId, globalRecordId, email)
    }

    await prisma.email.updateMany({
      where: {
        negotiation: { globalRecordId },
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

  throw createError({ statusCode: 400, message: 'Invalid action' })
})
