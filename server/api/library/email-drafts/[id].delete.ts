import { prisma } from '~/server/utils/prisma'
import { requirePermission, requireResourceScopeAccess } from '~/server/utils/permissions'

export default defineEventHandler(async (event) => {
  const user = await requirePermission(event, 'drafts.own.delete')
  const id = getRouterParam(event, 'id')!

  const draft = await prisma.emailDraft.findUnique({ where: { id } })
  if (!draft) throw createError({ statusCode: 404, statusMessage: 'E-mailová šablona nenalezena' })

  if (draft.authorId !== user.id) {
    await requirePermission(event, 'drafts.others.delete')
  }
  await requireResourceScopeAccess(event, draft)

  await prisma.$transaction([
    prisma.emailDraft.updateMany({ where: { derivedFromId: id }, data: { derivedFromId: null } }),
    prisma.pipelineStep.updateMany({ where: { emailDraftId: id }, data: { emailDraftId: null } }),
    prisma.emailDraft.delete({ where: { id } }),
  ])

  return { ok: true }
})
