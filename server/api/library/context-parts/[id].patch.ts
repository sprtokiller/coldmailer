import { prisma } from '~/server/utils/prisma'
import { requireAdmin, requireResourceScopeAccess } from '~/server/utils/permissions'
import { requireAuth } from '~/server/utils/requireAuth'
import { resolveLibraryScope } from '~/server/utils/libraryScope'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const id = getRouterParam(event, 'id')!
  const body = await readBody<{
    name?: string
    content?: string
    stepKeys?: string[]
    projectId?: string | null
    groupId?: string | null
  }>(event)

  const part = await prisma.contextPart.findUnique({ where: { id } })
  if (!part) throw createError({ statusCode: 404, statusMessage: 'Context part not found' })

  if (part.authorId !== user.id) {
    await requireAdmin(event)
  }
  await requireResourceScopeAccess(event, part)
  const scope = ('projectId' in body || 'groupId' in body)
    ? await resolveLibraryScope(event, body)
    : {}

  return prisma.contextPart.update({
    where: { id },
    data: {
      name: body.name ?? part.name,
      content: body.content ?? part.content,
      ...(body.stepKeys !== undefined ? { stepKeys: body.stepKeys } : {}),
      ...scope,
    },
    include: {
      author: { select: { id: true, name: true, image: true } },
      group: true,
      project: { include: { group: true } },
    },
  })
})
