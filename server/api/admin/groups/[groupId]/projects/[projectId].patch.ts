import { prisma } from '~/server/utils/prisma'
import { requireAdmin } from '~/server/utils/permissions'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const projectId = getRouterParam(event, 'projectId')!
  const body = await readBody<{ name?: string }>(event)

  const project = await prisma.project.findUnique({ where: { id: projectId } })
  if (!project) {
    throw createError({ statusCode: 404, message: 'Projekt nebyl nalezen.' })
  }

  const data: Record<string, unknown> = {}
  if (body.name !== undefined) {
    const trimmed = body.name.trim()
    if (!trimmed) throw createError({ statusCode: 400, message: 'Název nesmí být prázdný.' })
    data.name = trimmed
  }

  if (Object.keys(data).length === 0) {
    throw createError({ statusCode: 400, message: 'Nic ke změně.' })
  }

  return prisma.project.update({
    where: { id: projectId },
    data,
    include: { group: true },
  })
})
