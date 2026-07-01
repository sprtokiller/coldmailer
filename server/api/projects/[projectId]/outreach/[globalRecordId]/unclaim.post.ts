/**
 * POST /api/projects/[projectId]/outreach/[globalRecordId]/unclaim
 *
 * Umožní přihlášenému uživateli odstoupit od partnera, jehož je řešitelem.
 */
import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'
import { requireProjectAccess } from '~/server/utils/permissions'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const projectId = getRouterParam(event, 'projectId')!
  const globalRecordId = getRouterParam(event, 'globalRecordId')!
  await requireProjectAccess(event, projectId)

  const assignment = await prisma.outreachAssignment.findUnique({
    where: { projectId_globalRecordId: { projectId, globalRecordId } },
    select: { assigneeId: true },
  })

  if (!assignment) {
    throw createError({ statusCode: 404, message: 'Partner nemá žádné přiřazení.' })
  }

  if (assignment.assigneeId !== user.id) {
    throw createError({ statusCode: 403, message: 'Odstoupit může pouze přiřazený řešitel.' })
  }

  await prisma.outreachAssignment.delete({
    where: { projectId_globalRecordId: { projectId, globalRecordId } },
  })

  return { ok: true }
})
