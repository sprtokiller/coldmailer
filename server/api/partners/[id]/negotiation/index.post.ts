/**
 * POST /api/partners/[id]/negotiation
 *
 * Ensures a partner is visible in the active project's outreach/negotiation
 * workspace (creates the Negotiation row if missing), optionally pre-assigning
 * responsibility. Replaces the old "content-less FULFILLMENT interaction" trick.
 */
import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'
import { getActiveScope } from '~/server/utils/activeProject'

export default defineEventHandler(async (event) => {
  const session = await requireAuth(event)
  const globalRecordId = getRouterParam(event, 'id')!
  const scope = await getActiveScope(event)
  const projectId = scope.project?.id

  if (!projectId) {
    throw createError({ statusCode: 400, message: 'Není vybrán žádný projekt.' })
  }

  const body = await readBody<{ assigneeIds?: string[] }>(event)
  const assigneeIds = body.assigneeIds ?? []

  const negotiation = await prisma.negotiation.upsert({
    where: { projectId_globalRecordId: { projectId, globalRecordId } },
    create: { projectId, globalRecordId },
    update: {},
  })

  if (assigneeIds.length > 0) {
    await prisma.fulfillmentAssignee.createMany({
      data: assigneeIds.map(userId => ({ negotiationId: negotiation.id, userId })),
      skipDuplicates: true,
    })
  }
  if (assigneeIds.length === 1) {
    await prisma.outreachAssignment.upsert({
      where: { projectId_globalRecordId_assigneeId: { projectId, globalRecordId, assigneeId: assigneeIds[0] } },
      create: { projectId, globalRecordId, assigneeId: assigneeIds[0], assignedById: session.id },
      update: {},
    })
  }

  return negotiation
})
