/**
 * POST /api/partners/[id]/negotiation
 *
 * Ensures a partner is visible in the active project's outreach/negotiation
 * workspace (creates the Negotiation row if missing). Marks the row as manually
 * added (manuallyAddedAt) so it shows up in Jednání immediately, without waiting
 * for a first e-mail/note. Admin/Vedení obchodu only — ostatní členové obchodního
 * týmu se k partnerovi dostanou jen přes Oslovování.
 *
 * `assigneeIds` optionally pre-assigns responsibility, and `purpose` decides what
 * that means: 'negotiation' writes NegotiationAssignee rows (Jednání — can have
 * several people), 'outreach' (default) writes the single-owner OutreachAssignment
 * (Oslovování). FulfillmentAssignee is always populated regardless of purpose — it
 * only feeds the read-only cross-project "Ostatní projekty" signal in timeline.get.ts.
 */
import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'
import { getActiveScope } from '~/server/utils/activeProject'
import { getInteractionAccess } from '~/server/utils/projectPermissions'
import { upsertNegotiationAssignees } from '~/server/utils/negotiation-assignment'

export default defineEventHandler(async (event) => {
  const session = await requireAuth(event)
  const globalRecordId = getRouterParam(event, 'id')!
  const scope = await getActiveScope(event)
  const projectId = scope.project?.id

  if (!projectId) {
    throw createError({ statusCode: 400, message: 'Není vybrán žádný projekt.' })
  }

  const access = await getInteractionAccess(session.id, projectId)
  if (!access.isAdmin && !access.canEditAll) {
    throw createError({ statusCode: 403, message: 'Nemáte oprávnění přidávat partnery do projektu.' })
  }

  const body = await readBody<{ assigneeIds?: string[]; purpose?: 'outreach' | 'negotiation' }>(event)
  const assigneeIds = body.assigneeIds ?? []
  const purpose = body.purpose ?? 'outreach'

  if (purpose === 'outreach' && assigneeIds.length > 1) {
    throw createError({ statusCode: 400, message: 'Oslovování podporuje jen jednoho přiřazeného.' })
  }

  const negotiation = await prisma.negotiation.upsert({
    where: { projectId_globalRecordId: { projectId, globalRecordId } },
    create: { projectId, globalRecordId, manuallyAddedAt: new Date() },
    update: { removedAt: null, manuallyAddedAt: new Date() },
  })

  if (assigneeIds.length > 0) {
    await prisma.fulfillmentAssignee.createMany({
      data: assigneeIds.map(userId => ({ negotiationId: negotiation.id, userId })),
      skipDuplicates: true,
    })
  }

  if (purpose === 'negotiation') {
    await upsertNegotiationAssignees(projectId, globalRecordId, assigneeIds, session.id)
  } else if (assigneeIds.length === 1) {
    await prisma.outreachAssignment.upsert({
      where: { projectId_globalRecordId_assigneeId: { projectId, globalRecordId, assigneeId: assigneeIds[0] } },
      create: { projectId, globalRecordId, assigneeId: assigneeIds[0], assignedById: session.id },
      update: {},
    })
  }

  return negotiation
})
