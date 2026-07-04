import { prisma } from '~/server/utils/prisma'
import { requireAdmin, requireResourceScopeAccess } from '~/server/utils/permissions'
import { requireAuth } from '~/server/utils/requireAuth'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const id = getRouterParam(event, 'id')!

  const prompt = await prisma.systemPrompt.findUnique({ where: { id } })
  if (!prompt) throw createError({ statusCode: 404, message: 'Prompt nenalezen' })

  if (prompt.isSystem) {
    await requireAdmin(event)
  } else if (prompt.authorId !== user.id) {
    await requireAdmin(event)
  }
  if (!prompt.isSystem) await requireResourceScopeAccess(event, prompt)

  await prisma.$transaction([
    prisma.systemPrompt.updateMany({ where: { derivedFromId: id }, data: { derivedFromId: null } }),
    prisma.systemPrompt.delete({ where: { id } }),
  ])

  return { ok: true }
})
