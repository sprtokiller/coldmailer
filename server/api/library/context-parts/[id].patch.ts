import { prisma } from '~/server/utils/prisma'
import { requirePermission } from '~/server/utils/permissions'

export default defineEventHandler(async (event) => {
  const user = await requirePermission(event, 'context.own.edit')
  const id = getRouterParam(event, 'id')!
  const body = await readBody<{ name?: string; content?: string; stepKeys?: string[] }>(event)

  const part = await prisma.contextPart.findUnique({ where: { id } })
  if (!part) throw createError({ statusCode: 404, statusMessage: 'Context part not found' })

  if (part.authorId !== user.id) {
    await requirePermission(event, 'context.others.edit')
  }

  return prisma.contextPart.update({
    where: { id },
    data: {
      name: body.name ?? part.name,
      content: body.content ?? part.content,
      ...(body.stepKeys !== undefined ? { stepKeys: body.stepKeys } : {}),
    },
  })
})
