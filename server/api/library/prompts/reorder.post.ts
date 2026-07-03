import { prisma } from '~/server/utils/prisma'
import { requireAdmin, requireResourceScopeAccess } from '~/server/utils/permissions'
import { requireAuth } from '~/server/utils/requireAuth'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const body = await readBody<{ ids: string[] }>(event)
  const ids = Array.isArray(body?.ids) ? body.ids.filter(id => typeof id === 'string') : []
  if (ids.length === 0) throw createError({ statusCode: 400, message: 'ids je povinné pole' })

  const prompts = await prisma.systemPrompt.findMany({ where: { id: { in: ids } } })
  if (prompts.length !== ids.length) throw createError({ statusCode: 404, message: 'Některý prompt nebyl nalezen' })

  for (const prompt of prompts) {
    if (prompt.isSystem) {
      await requireAdmin(event)
    } else if (prompt.authorId !== user.id) {
      await requireAdmin(event)
    }
    if (!prompt.isSystem) await requireResourceScopeAccess(event, prompt)
  }

  await prisma.$transaction(
    ids.map((id, index) => prisma.systemPrompt.update({ where: { id }, data: { order: index } })),
  )

  return { success: true }
})
