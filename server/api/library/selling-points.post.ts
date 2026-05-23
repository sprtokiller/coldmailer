import { prisma } from '~/server/utils/prisma'
import { requirePermission } from '~/server/utils/permissions'

export default defineEventHandler(async (event) => {
  const user = await requirePermission(event, 'selling.own.edit')
  const body = await readBody<{ name: string; content: string; derivedFromId?: string }>(event)

  return prisma.sellingPoint.create({
    data: {
      name: body.name,
      content: body.content,
      authorId: user.id,
      derivedFromId: body.derivedFromId ?? null,
    },
    include: { author: { select: { id: true, name: true, image: true } } },
  })
})
