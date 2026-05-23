import { prisma } from '~/server/utils/prisma'
import { requirePermission } from '~/server/utils/permissions'

export default defineEventHandler(async (event) => {
  const user = await requirePermission(event, 'drafts.own.edit')
  const id = getRouterParam(event, 'id')!
  const body = await readBody<{ name?: string; subject?: string; body?: string }>(event)

  const draft = await prisma.emailDraft.findUnique({ where: { id } })
  if (!draft) throw createError({ statusCode: 404, statusMessage: 'Draft not found' })

  if (draft.authorId !== user.id) {
    await requirePermission(event, 'drafts.others.edit')
  }

  return prisma.emailDraft.update({
    where: { id },
    data: {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.subject !== undefined ? { subject: body.subject } : {}),
      ...(body.body !== undefined ? { body: body.body } : {}),
    },
    include: { author: { select: { id: true, name: true, image: true } } },
  })
})
