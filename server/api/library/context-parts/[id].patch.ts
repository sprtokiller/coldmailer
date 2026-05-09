import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const id = getRouterParam(event, 'id')!
  const body = await readBody<{ name?: string; content?: string; stepKeys?: string[] }>(event)

  const part = await prisma.contextPart.findUnique({ where: { id } })
  if (!part) throw createError({ statusCode: 404, statusMessage: 'Context part not found' })

  return prisma.contextPart.update({
    where: { id },
    data: {
      name: body.name ?? part.name,
      content: body.content ?? part.content,
      ...(body.stepKeys !== undefined ? { stepKeys: body.stepKeys } : {}),
    },
  })
})
