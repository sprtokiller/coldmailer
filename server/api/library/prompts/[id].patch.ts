import { prisma } from '~/server/utils/prisma'
import { requirePermission } from '~/server/utils/permissions'

export default defineEventHandler(async (event) => {
  const user = await requirePermission(event, 'prompts.own.edit')
  const id = getRouterParam(event, 'id')!
  const body = await readBody<{ name: string; content: string; stepType: string }>(event)

  const prompt = await prisma.systemPrompt.findUnique({ where: { id } })
  if (!prompt) throw createError({ statusCode: 404, statusMessage: 'Prompt not found' })

  // isSystem prompts require prompts.system.edit
  if (prompt.isSystem) {
    await requirePermission(event, 'prompts.system.edit')
  } else if (prompt.authorId !== user.id) {
    // Other user's prompt requires prompts.others.edit
    await requirePermission(event, 'prompts.others.edit')
  }

  return prisma.systemPrompt.update({
    where: { id },
    data: { name: body.name, content: body.content, stepType: body.stepType as never },
    include: { author: { select: { id: true, name: true, image: true } } },
  })
})
