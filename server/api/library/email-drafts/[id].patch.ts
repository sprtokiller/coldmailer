import { prisma } from '~/server/utils/prisma'
import { requireAdmin, requireResourceScopeAccess } from '~/server/utils/permissions'
import { requireAuth } from '~/server/utils/requireAuth'
import { resolveLibraryScope } from '~/server/utils/libraryScope'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const id = getRouterParam(event, 'id')!
  const body = await readBody<{
    name?: string
    subject?: string
    body?: string
    projectId?: string | null
    groupId?: string | null
  }>(event)

  const draft = await prisma.emailDraft.findUnique({ where: { id } })
  if (!draft) throw createError({ statusCode: 404, statusMessage: 'Draft not found' })

  if (draft.authorId !== user.id) {
    await requireAdmin(event)
  }
  await requireResourceScopeAccess(event, draft)
  const scope = ('projectId' in body || 'groupId' in body)
    ? await resolveLibraryScope(event, body)
    : {}

  return prisma.emailDraft.update({
    where: { id },
    data: {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.subject !== undefined ? { subject: body.subject } : {}),
      ...(body.body !== undefined ? { body: body.body } : {}),
      ...scope,
    },
    include: {
      author: { select: { id: true, name: true, image: true } },
      group: true,
      project: { include: { group: true } },
    },
  })
})
