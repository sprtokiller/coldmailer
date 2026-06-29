import { prisma } from '~/server/utils/prisma'
import { requireAdmin } from '~/server/utils/permissions'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const projectId = getRouterParam(event, 'projectId')!

  const project = await prisma.project.findUnique({ where: { id: projectId } })
  if (!project) {
    throw createError({ statusCode: 404, statusMessage: 'Projekt nebyl nalezen.' })
  }

  await prisma.project.delete({ where: { id: projectId } })

  return { ok: true }
})
