import { prisma } from '~/server/utils/prisma'
import { requireAdmin, requireResourceScopeAccess } from '~/server/utils/permissions'
import { requireAuth } from '~/server/utils/requireAuth'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const body = await readBody<{ ids: string[] }>(event)
  const ids = Array.isArray(body?.ids) ? body.ids.filter(id => typeof id === 'string') : []
  if (ids.length === 0) throw createError({ statusCode: 400, message: 'ids je povinné pole' })

  const parts = await prisma.contextPart.findMany({ where: { id: { in: ids } } })
  if (parts.length !== ids.length) throw createError({ statusCode: 404, message: 'Některá kontextová část nebyla nalezena' })

  for (const part of parts) {
    if (part.authorId !== user.id) {
      await requireAdmin(event)
    }
    if (!part.isPrivate) await requireResourceScopeAccess(event, part)
  }

  await prisma.$transaction(
    ids.map((id, index) => prisma.contextPart.update({ where: { id }, data: { order: index } })),
  )

  return { success: true }
})
