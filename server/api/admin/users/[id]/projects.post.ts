import { prisma } from '~/server/utils/prisma'
import { requirePermission } from '~/server/utils/permissions'

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'admin.roles')

  const userId = getRouterParam(event, 'id')!
  const body = await readBody<{ projectId: string }>(event)
  if (!body.projectId) {
    throw createError({ statusCode: 400, statusMessage: 'projectId je povinné' })
  }

  const [user, project] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.project.findUnique({ where: { id: body.projectId } }),
  ])
  if (!user) throw createError({ statusCode: 404, statusMessage: 'Uživatel nenalezen' })
  if (!project) throw createError({ statusCode: 404, statusMessage: 'Projekt nenalezen' })

  await prisma.userProject.upsert({
    where: { userId_projectId: { userId, projectId: body.projectId } },
    create: { userId, projectId: body.projectId },
    update: {},
  })

  return { ok: true }
})
