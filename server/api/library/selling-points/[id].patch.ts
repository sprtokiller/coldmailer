import { prisma } from '~/server/utils/prisma'
import { requirePermission } from '~/server/utils/permissions'

export default defineEventHandler(async (event) => {
  const user = await requirePermission(event, 'selling.own.edit')
  const id = getRouterParam(event, 'id')!
  const body = await readBody<{ name?: string; content?: string }>(event)

  const part = await prisma.sellingPoint.findUnique({ where: { id } })
  if (!part) throw createError({ statusCode: 404, statusMessage: 'Selling point not found' })

  if (part.authorId !== user.id) {
    await requirePermission(event, 'selling.others.edit')
  }

  return prisma.sellingPoint.update({
    where: { id },
    data: { name: body.name ?? part.name, content: body.content ?? part.content },
  })
})
