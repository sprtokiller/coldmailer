/**
 * POST /api/projects/[projectId]/outreach/[globalRecordId]/assign
 *
 * Admin-only: přiřadí konkrétního uživatele nebo odebere přiřazení.
 * Body: { userId: string | null } — null = odebrat přiřazení
 */
import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'
import { requireProjectAccess, getUserScopeAccess } from '~/server/utils/permissions'

export default defineEventHandler(async (event) => {
  const session = await requireAuth(event)
  const projectId = getRouterParam(event, 'projectId')!
  const globalRecordId = getRouterParam(event, 'globalRecordId')!
  await requireProjectAccess(event, projectId)

  const access = await getUserScopeAccess(session.id)
  if (!access.isAdmin) {
    throw createError({ statusCode: 403, message: 'Pouze administrátoři mohou přiřazovat partnery.' })
  }

  const { userId } = await readBody<{ userId: string | null }>(event)

  if (userId === null) {
    await prisma.outreachAssignment.deleteMany({ where: { projectId, globalRecordId } })
    return { assignment: null }
  }

  const targetUser = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } })
  if (!targetUser) throw createError({ statusCode: 400, message: 'Uživatel nebyl nalezen.' })

  const assignment = await prisma.outreachAssignment.upsert({
    where: { projectId_globalRecordId: { projectId, globalRecordId } },
    create: { projectId, globalRecordId, assigneeId: userId, assignedById: session.id },
    update: { assigneeId: userId, assignedById: session.id },
    include: { assignee: { select: { id: true, name: true, image: true } } },
  })

  return { assignment }
})
