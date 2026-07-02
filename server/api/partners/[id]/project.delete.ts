import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'
import { getActiveScope } from '~/server/utils/activeProject'
import { getInteractionAccess } from '~/server/utils/projectPermissions'

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
    throw createError({ statusCode: 403, message: 'Nemáte oprávnění odebrat partnera z projektu.' })
  }

  // Only remove the partner↔project link and its outreach assignment(s).
  // Interactions (jednání, e-maily, poznámky), AI alignment a rozpracované drafty
  // zůstávají zachované, aby se historie obnovila při opětovném přidání partnera.
  await prisma.$transaction([
    prisma.outreachAssignment.deleteMany({ where: { projectId, globalRecordId } }),
    prisma.projectRecord.deleteMany({ where: { projectId, globalRecordId } }),
  ])

  return { success: true }
})
