import { prisma } from '~/server/utils/prisma'
import { requirePermission, requireResourceScopeAccess } from '~/server/utils/permissions'

export default defineEventHandler(async (event) => {
  const user = await requirePermission(event, 'prompts.own.delete')
  const id = getRouterParam(event, 'id')!

  const prompt = await prisma.systemPrompt.findUnique({ where: { id } })
  if (!prompt) throw createError({ statusCode: 404, statusMessage: 'Prompt nenalezen' })

  if (prompt.isSystem) {
    await requirePermission(event, 'prompts.system.edit')
  } else if (prompt.authorId !== user.id) {
    await requirePermission(event, 'prompts.others.delete')
  }
  if (!prompt.isSystem) await requireResourceScopeAccess(event, prompt)

  await prisma.$transaction([
    prisma.systemPrompt.updateMany({ where: { derivedFromId: id }, data: { derivedFromId: null } }),
    prisma.pipelineStep.updateMany({ where: { systemPromptId: id }, data: { systemPromptId: null } }),
    prisma.systemPrompt.delete({ where: { id } }),
  ])

  return { ok: true }
})
