/**
 * POST /api/projects/[projectId]/outreach/[globalRecordId]/assign
 *
 * Admin-only: přiřadí konkrétního uživatele nebo odebere přiřazení.
 * Body: { userId: string | null } — null = odebrat přiřazení
 */
import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'
import { requireProjectAccess } from '~/server/utils/permissions'
import { getInteractionAccess } from '~/server/utils/projectPermissions'

export default defineEventHandler(async (event) => {
  const session = await requireAuth(event)
  const projectId = getRouterParam(event, 'projectId')!
  const globalRecordId = getRouterParam(event, 'globalRecordId')!
  await requireProjectAccess(event, projectId)

  const access = await getInteractionAccess(session.id, projectId)
  if (!access.isAdmin && !access.canEditAll) {
    throw createError({ statusCode: 403, message: 'Nemáte oprávnění přiřazovat partnery.' })
  }

  const { userId } = await readBody<{ userId: string | null }>(event)

  if (userId === null) {
    await prisma.outreachAssignment.deleteMany({ where: { projectId, globalRecordId } })
    return { assignment: null }
  }

  const targetUser = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } })
  if (!targetUser) throw createError({ statusCode: 400, message: 'Uživatel nebyl nalezen.' })

  // Oslovování uses single-user assign: replace all existing with the new one
  await prisma.outreachAssignment.deleteMany({ where: { projectId, globalRecordId } })
  const assignment = await prisma.outreachAssignment.create({
    data: { projectId, globalRecordId, assigneeId: userId, assignedById: session.id },
    include: { assignee: { select: { id: true, name: true, image: true } } },
  })

  return { assignment }
})
