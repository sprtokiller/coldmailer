import { prisma } from '~/server/utils/prisma'
import { requireAdmin, requireResourceScopeAccess } from '~/server/utils/permissions'
import { requireAuth } from '~/server/utils/requireAuth'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const body = await readBody<{ ids: string[] }>(event)
  const ids = Array.isArray(body?.ids) ? body.ids.filter(id => typeof id === 'string') : []
  if (ids.length === 0) throw createError({ statusCode: 400, message: 'ids je povinné pole' })

  const drafts = await prisma.emailDraft.findMany({ where: { id: { in: ids } } })
  if (drafts.length !== ids.length) throw createError({ statusCode: 404, message: 'Některá e-mailová šablona nebyla nalezena' })

  for (const draft of drafts) {
    if (draft.authorId !== user.id) {
      await requireAdmin(event)
    }
    await requireResourceScopeAccess(event, draft)
  }

  await prisma.$transaction(
    ids.map((id, index) => prisma.emailDraft.update({ where: { id }, data: { order: index } })),
  )

  return { success: true }
})
