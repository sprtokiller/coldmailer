import { prisma } from '~/server/utils/prisma'
import { requireAdmin } from '~/server/utils/permissions'
import { requireAuth } from '~/server/utils/requireAuth'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const id = getRouterParam(event, 'id')!
  const body = await readBody<{ name?: string; content?: string; groupId?: string }>(event)

  const sig = await prisma.signature.findUnique({ where: { id } })
  if (!sig) throw createError({ statusCode: 404, message: 'Podpis nenalezen' })

  if (sig.isTemplate) {
    await requireAdmin(event)
  } else {
    if (sig.authorId !== user.id) throw createError({ statusCode: 403, message: 'Nemáte oprávnění upravit tento podpis' })
  }

  return prisma.signature.update({
    where: { id },
    data: {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.content !== undefined ? { content: body.content } : {}),
      ...(body.groupId !== undefined ? { groupId: body.groupId } : {}),
    },
  })
})
