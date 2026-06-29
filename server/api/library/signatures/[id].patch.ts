import { prisma } from '~/server/utils/prisma'
import { requireAdmin } from '~/server/utils/permissions'
import { requireAuth } from '~/server/utils/requireAuth'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const id = getRouterParam(event, 'id')!
  const body = await readBody<{ name?: string; content?: string; isDefault?: boolean }>(event)

  const sig = await prisma.signature.findUnique({ where: { id } })
  if (!sig) throw createError({ statusCode: 404, statusMessage: 'Podpis nenalezen' })

  if (sig.isSystem) {
    await requireAdmin(event)
  } else {
    if (sig.authorId !== user.id) throw createError({ statusCode: 403, statusMessage: 'Nemáte oprávnění upravit tento podpis' })
  }

  const allowIsDefault = !sig.isSystem && body.isDefault !== undefined

  if (allowIsDefault && body.isDefault) {
    await prisma.signature.updateMany({
      where: { authorId: user.id, isSystem: false, isDefault: true },
      data: { isDefault: false },
    })
  }

  return prisma.signature.update({
    where: { id },
    data: {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.content !== undefined ? { content: body.content } : {}),
      ...(allowIsDefault ? { isDefault: body.isDefault } : {}),
    },
  })
})
