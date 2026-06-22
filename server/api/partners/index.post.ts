import { prisma } from '~/server/utils/prisma'
import { requirePermission } from '~/server/utils/permissions'
import { normalizeName } from '~/server/utils/deduplication'
import { logEvent } from '~/server/utils/record-events'
import { getActiveScope } from '~/server/utils/activeProject'
import { getInteractionAccess } from '~/server/utils/projectPermissions'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, 'partners.create')

  const body = await readBody<{
    canonicalName: string
    payload?: Record<string, unknown>
    createInteraction?: boolean
    assigneeIds?: string[]
  }>(event)

  const name = body.canonicalName?.trim()
  if (!name) {
    throw createError({ statusCode: 400, statusMessage: 'Název partnera je povinný.' })
  }

  const normalized = normalizeName(name)

  const existing = await prisma.globalRecord.findUnique({
    where: { normalizedName_type: { normalizedName: normalized, type: 'PARTNER' } },
  })
  if (existing) {
    throw createError({
      statusCode: 409,
      statusMessage: `Partner "${existing.canonicalName}" již existuje.`,
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

  let interaction = null
  if (body.createInteraction) {
    const scope = await getActiveScope(event)
    const projectId = scope.project?.id
    if (projectId) {
      const access = await getInteractionAccess(session.id, projectId)
      const assigneeIds = [...(body.assigneeIds ?? [])]
      if (!access.canEditAll && !access.isAdmin && !assigneeIds.includes(session.id)) {
        assigneeIds.push(session.id)
      }

      interaction = await prisma.interaction.create({
        data: {
          globalRecordId: record.id,
          projectId,
          type: 'FULFILLMENT',
          createdBy: session.id,
          assignees: assigneeIds.length > 0
            ? { create: assigneeIds.map(userId => ({ userId })) }
            : undefined,
        },
      })
    }
  }

  return { record, interaction }
})
