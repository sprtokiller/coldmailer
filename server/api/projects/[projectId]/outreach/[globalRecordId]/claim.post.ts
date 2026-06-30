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

  const existing = await prisma.outreachAssignment.findUnique({
    where: { projectId_globalRecordId: { projectId, globalRecordId } },
  })
  if (existing && existing.assigneeId !== user.id) {
    throw createError({ statusCode: 409, message: 'Tento partner je již přiřazen jinému uživateli.' })
  }

  const assignment = await prisma.outreachAssignment.upsert({
    where: { projectId_globalRecordId: { projectId, globalRecordId } },
    create: { projectId, globalRecordId, assigneeId: user.id, assignedById: user.id },
    update: {},
    include: { assignee: { select: { id: true, name: true, image: true } } },
  })

  return assignment
})
