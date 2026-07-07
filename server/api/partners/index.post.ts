import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'
import { normalizeName } from '~/server/utils/deduplication'
import { logEvent } from '~/server/utils/record-events'
import { getActiveScope } from '~/server/utils/activeProject'
import { getInteractionAccess } from '~/server/utils/projectPermissions'
import { syncGmailForPartnerEmail, getEmailSyncHistoryDays } from '~/server/utils/gmail-sync'

export default defineEventHandler(async (event) => {
  const session = await requireAuth(event)

  const body = await readBody<{
    canonicalName: string
    payload?: Record<string, unknown>
    joinProject?: boolean
    assigneeIds?: string[]
  }>(event)

  const name = body.canonicalName?.trim()
  if (!name) {
    throw createError({ statusCode: 400, message: 'Název partnera je povinný.' })
  }

  const normalized = normalizeName(name)

  const existing = await prisma.globalRecord.findUnique({
    where: { normalizedName_type: { normalizedName: normalized, type: 'PARTNER' } },
  })
  if (existing) {
    throw createError({
      statusCode: 409,
      message: `Partner "${existing.canonicalName}" již existuje.`,
      data: { existingId: existing.id, existingName: existing.canonicalName },
    })
  }

  const record = await prisma.globalRecord.create({
    data: {
      type: 'PARTNER',
      canonicalName: name,
      normalizedName: normalized,
      payload: (body.payload ?? {}) as never,
      createdBy: session.id,
    },
  })

  await logEvent({
    globalRecordId: record.id,
    userId: session.id,
    eventType: 'MANUAL_CREATE',
  })

  const contacts = Array.isArray((body.payload as any)?.contacts) ? (body.payload as any).contacts : []
  const emailContacts = contacts.filter((c: any) => c.email?.trim())

  for (let i = 0; i < contacts.length; i++) {
    const c = contacts[i]
    const address = c.email?.trim() ? c.email.trim().toLowerCase() : null
    try {
      await prisma.partnerContact.create({
        data: {
          globalRecordId: record.id,
          address,
          label: [c.firstName, c.lastName].filter(Boolean).join(' ') || null,
          firstName: c.firstName || null,
          lastName: c.lastName || null,
          role: c.role || null,
          contactType: c.type || null,
          priority: c.priority ?? 3,
          note: c.note || null,

        },
      })
    } catch (e: any) {
      if (e?.code !== 'P2002') throw e
    }
  }

  let negotiation = null
  if (body.joinProject) {
    const scope = await getActiveScope(event)
    const projectId = scope.project?.id
    if (projectId) {
      const access = await getInteractionAccess(session.id, projectId)
      const assigneeIds = [...(body.assigneeIds ?? [])]
      if (!access.canEditAll && !access.isAdmin && !assigneeIds.includes(session.id)) {
        assigneeIds.push(session.id)
      }

      negotiation = await prisma.negotiation.create({
        data: { globalRecordId: record.id, projectId, negotiationStatus: 'PRED_OSLOVENIM' },
      })
      if (assigneeIds.length > 0) {
        await prisma.fulfillmentAssignee.createMany({
          data: assigneeIds.map(userId => ({ negotiationId: negotiation!.id, userId })),
          skipDuplicates: true,
        })
      }
    }
  }

  if (emailContacts.length > 0) {
    const syncProjectId = negotiation?.projectId ?? undefined
    getEmailSyncHistoryDays().then(historyDays => {
      for (const c of emailContacts) {
        syncGmailForPartnerEmail(session.id, record.id, c.email.trim(), historyDays, syncProjectId)
          .catch(err => console.warn('[gmail-sync] Targeted sync failed:', err.message ?? err))
      }
    })
  }

  return { record, negotiation }
})

