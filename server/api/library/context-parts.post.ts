import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const body = await readBody<{ name: string; content: string; derivedFromId?: string }>(event)

  return prisma.contextPart.create({
    data: {
      name: body.name,
      content: body.content,
      authorId: user.id,
      derivedFromId: body.derivedFromId ?? null,
    },
    include: { author: { select: { id: true, name: true, image: true } } },
  })
})
