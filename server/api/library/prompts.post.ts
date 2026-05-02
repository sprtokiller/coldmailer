import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const body = await readBody<{
    name: string
    content: string
    stepType: string
    derivedFromId?: string
  }>(event)

  return prisma.systemPrompt.create({
    data: {
      name: body.name,
      content: body.content,
      stepType: body.stepType as never,
      authorId: user.id,
      derivedFromId: body.derivedFromId ?? null,
    },
    include: { author: { select: { id: true, name: true, image: true } } },
  })
})
