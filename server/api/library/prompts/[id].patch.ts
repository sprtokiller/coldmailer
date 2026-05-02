import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const id = getRouterParam(event, 'id')!
  const body = await readBody<{ name: string; content: string; stepType: string }>(event)

  const prompt = await prisma.systemPrompt.findUnique({ where: { id } })
  if (!prompt) throw createError({ statusCode: 404, statusMessage: 'Prompt not found' })
  if (prompt.authorId !== user.id) throw createError({ statusCode: 403, statusMessage: 'Forbidden' })

  return prisma.systemPrompt.update({
    where: { id },
    data: { name: body.name, content: body.content, stepType: body.stepType as never },
    include: { author: { select: { id: true, name: true, image: true } } },
  })
})
