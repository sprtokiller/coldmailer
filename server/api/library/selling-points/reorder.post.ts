import { prisma } from '~/server/utils/prisma'
import { requireAdmin, requireResourceScopeAccess } from '~/server/utils/permissions'
import { requireAuth } from '~/server/utils/requireAuth'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const body = await readBody<{ ids: string[] }>(event)
  const ids = Array.isArray(body?.ids) ? body.ids.filter(id => typeof id === 'string') : []
  if (ids.length === 0) throw createError({ statusCode: 400, message: 'ids je povinné pole' })

  const points = await prisma.sellingPoint.findMany({ where: { id: { in: ids } } })
  if (points.length !== ids.length) throw createError({ statusCode: 404, message: 'Některý prodejní argument nebyl nalezen' })

  for (const point of points) {
    if (point.authorId !== user.id) {
      await requireAdmin(event)
    }
    await requireResourceScopeAccess(event, point)
  }

  await prisma.$transaction(
    ids.map((id, index) => prisma.sellingPoint.update({ where: { id }, data: { order: index } })),
  )

  return { success: true }
})
