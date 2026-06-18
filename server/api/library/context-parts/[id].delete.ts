import { prisma } from '~/server/utils/prisma'
import { requirePermission, requireResourceScopeAccess } from '~/server/utils/permissions'

export default defineEventHandler(async (event) => {
  const user = await requirePermission(event, 'context.own.delete')
  const id = getRouterParam(event, 'id')!

  const part = await prisma.contextPart.findUnique({ where: { id } })
  if (!part) throw createError({ statusCode: 404, statusMessage: 'Kontextová část nenalezena' })

  if (part.authorId !== user.id) {
    await requirePermission(event, 'context.others.delete')
  }
  await requireResourceScopeAccess(event, part)

  const stepsWithPart = await prisma.pipelineStep.findMany({
    where: { contextPartIds: { has: id } },
    select: { id: true, contextPartIds: true },
  })

  await prisma.$transaction([
    ...stepsWithPart.map(step =>
      prisma.pipelineStep.update({
        where: { id: step.id },
        data: { contextPartIds: step.contextPartIds.filter(cid => cid !== id) },
      }),
    ),
    prisma.contextPart.updateMany({ where: { derivedFromId: id }, data: { derivedFromId: null } }),
    prisma.contextPart.delete({ where: { id } }),
  ])

  return { ok: true }
})
