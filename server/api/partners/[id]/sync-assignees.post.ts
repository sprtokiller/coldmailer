import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'
import { getActiveScope } from '~/server/utils/activeProject'
import { canEditNegotiation } from '~/server/utils/projectPermissions'
import { syncGmailForNegotiationRecord } from '~/server/utils/gmail-sync'

export default defineEventHandler(async (event) => {
  const session = await requireAuth(event)
  const globalRecordId = getRouterParam(event, 'id')!
  const scope = await getActiveScope(event)
  const projectId = scope.project?.id

  if (!projectId) {
    throw createError({ statusCode: 400, message: 'No active project context' })
  }

  const canEdit = await canEditNegotiation(session.id, projectId, globalRecordId)
  if (!canEdit) {
    throw createError({ statusCode: 403, message: 'Nemáte oprávnění synchronizovat tohoto partnera.' })
  }

  const body = await readBody<{ lookbackDays?: number }>(event).catch(() => null)
  const lookbackDays = body?.lookbackDays && body.lookbackDays > 0 ? body.lookbackDays : 90

  const assignees = await prisma.negotiationAssignee.findMany({
    where: { projectId, globalRecordId },
    select: { userId: true },
  })

  if (assignees.length === 0) {
    return { synced: 0, skipped: 'no-assignees' }
  }

  const results = await Promise.allSettled(
    assignees.map(a => syncGmailForNegotiationRecord(a.userId, projectId, globalRecordId, lookbackDays)),
  )

  const synced = results.reduce((sum, r) => sum + (r.status === 'fulfilled' ? r.value.synced : 0), 0)

  return { synced }
})
