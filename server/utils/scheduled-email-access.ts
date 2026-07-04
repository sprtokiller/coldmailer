import type { H3Event } from 'h3'
import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'
import { getActiveScope } from '~/server/utils/activeProject'
import { getInteractionAccess, canEditNegotiation } from '~/server/utils/projectPermissions'

/** For the list endpoint: can this user see scheduled e-mails for this partner at all? */
export async function getScheduledEmailListAccess(event: H3Event, globalRecordId: string) {
  const session = await requireAuth(event)
  const scope = await getActiveScope(event)
  const projectId = scope.project?.id
  if (!projectId) return { projectId: null as string | null, canView: false }

  const access = await getInteractionAccess(session.id, projectId)
  const canView = access.canViewAll || access.isAdmin || await canEditNegotiation(session.id, projectId, globalRecordId)
  return { projectId, canView }
}

/** For single-item endpoints (patch/delete/send-now): resolves and authorizes one ScheduledEmail. */
export async function requireScheduledEmailAccess(event: H3Event) {
  const session = await requireAuth(event)
  const globalRecordId = getRouterParam(event, 'id')!
  const scheduledId = getRouterParam(event, 'scheduledId')!
  const scope = await getActiveScope(event)
  const projectId = scope.project?.id

  if (!projectId) {
    throw createError({ statusCode: 400, message: 'Není vybrán žádný projekt.' })
  }

  const existing = await prisma.scheduledEmail.findUnique({ where: { id: scheduledId } })
  if (!existing || existing.projectId !== projectId || existing.globalRecordId !== globalRecordId) {
    throw createError({ statusCode: 404, message: 'Naplánovaný e-mail nenalezen.' })
  }

  const canEdit = await canEditNegotiation(session.id, projectId, globalRecordId)
  if (!canEdit) {
    throw createError({ statusCode: 403, message: 'Nemáte oprávnění k tomuto naplánovanému e-mailu.' })
  }

  return { session, projectId, globalRecordId, scheduledId, existing }
}
