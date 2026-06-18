import { prisma } from '~/server/utils/prisma'
import { requirePermission } from '~/server/utils/permissions'

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'admin.roles')

  const userId = getRouterParam(event, 'id')!
  const projectId = getRouterParam(event, 'projectId')!

  await prisma.userProject.delete({
    where: { userId_projectId: { userId, projectId } },
  }).catch(() => {
    throw createError({ statusCode: 404, statusMessage: 'Přiřazení projektu nenalezeno' })
  })

  return { ok: true }
})
