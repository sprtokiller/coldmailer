import { prisma } from '~/server/utils/prisma'
import { requirePermission, requireResourceScopeAccess } from '~/server/utils/permissions'

export default defineEventHandler(async (event) => {
  const user = await requirePermission(event, 'selling.own.delete')
  const id = getRouterParam(event, 'id')!

  const part = await prisma.sellingPoint.findUnique({ where: { id } })
  if (!part) throw createError({ statusCode: 404, statusMessage: 'Prodejní argument nenalezen' })

  if (part.authorId !== user.id) {
    await requirePermission(event, 'selling.others.delete')
  }
  await requireResourceScopeAccess(event, part)

  await prisma.$transaction([
    prisma.sellingPoint.updateMany({ where: { derivedFromId: id }, data: { derivedFromId: null } }),
    prisma.pipelineStep.updateMany({ where: { sellingPointId: id }, data: { sellingPointId: null } }),
    prisma.sellingPoint.delete({ where: { id } }),
  ])

  return { ok: true }
})
