/**
 * POST /api/projects/[projectId]/outreach/[globalRecordId]/claim
 *
 * Přiřadí aktuálního uživatele jako zodpovědného za partnera v outreach.
 * Funguje pouze pokud partner ještě nemá nikoho přiřazeného.
 */
import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'
import { requireProjectAccess } from '~/server/utils/permissions'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const projectId = getRouterParam(event, 'projectId')!
  const globalRecordId = getRouterParam(event, 'globalRecordId')!
  await requireProjectAccess(event, projectId)

  const assignment = await prisma.outreachAssignment.upsert({
    where: { projectId_globalRecordId_assigneeId: { projectId, globalRecordId, assigneeId: user.id } },
    create: { projectId, globalRecordId, assigneeId: user.id, assignedById: user.id },
    update: {},
    include: { assignee: { select: { id: true, name: true, image: true } } },
  })

  return assignment
})
