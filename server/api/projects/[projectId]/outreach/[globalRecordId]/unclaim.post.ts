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

  const assignment = await prisma.outreachAssignment.findFirst({
    where: { projectId, globalRecordId, assigneeId: user.id },
    select: { id: true },
  })

  if (!assignment) {
    throw createError({ statusCode: 404, message: 'Nejste přiřazeni k tomuto partnerovi.' })
  }

  await prisma.outreachAssignment.deleteMany({
    where: { projectId, globalRecordId, assigneeId: user.id },
  })

  return { ok: true }
})
