import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const id = getRouterParam(event, 'id')!
  const body = await readBody<{ name?: string; content?: string; isDefault?: boolean }>(event)

  if (body.isDefault) {
    await prisma.signature.updateMany({
      where: { authorId: user.id, isDefault: true },
      data: { isDefault: false },
    })
  }

  return prisma.signature.update({
    where: { id },
    data: {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.content !== undefined ? { content: body.content } : {}),
      ...(body.isDefault !== undefined ? { isDefault: body.isDefault } : {}),
    },
  })
})
