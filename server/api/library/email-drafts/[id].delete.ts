import { prisma } from '~/server/utils/prisma'
import { requireAdmin, requireResourceScopeAccess } from '~/server/utils/permissions'
import { requireAuth } from '~/server/utils/requireAuth'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const id = getRouterParam(event, 'id')!

  const draft = await prisma.emailDraft.findUnique({ where: { id } })
  if (!draft) throw createError({ statusCode: 404, message: 'E-mailová šablona nenalezena' })

  if (draft.authorId !== user.id) {
    await requireAdmin(event)
  }
  await requireResourceScopeAccess(event, draft)

  await prisma.$transaction([
    prisma.emailDraft.updateMany({ where: { derivedFromId: id }, data: { derivedFromId: null } }),
    prisma.pipelineStep.updateMany({ where: { emailDraftId: id }, data: { emailDraftId: null } }),
    prisma.emailDraft.delete({ where: { id } }),
  ])

  return { ok: true }
})
