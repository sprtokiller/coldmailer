import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const body = await readBody<{ name: string; content: string; isDefault?: boolean }>(event)

  if (body.isDefault) {
    await prisma.signature.updateMany({
      where: { authorId: user.id, isDefault: true },
      data: { isDefault: false },
    })
  }

  return prisma.signature.create({
    data: {
      name: body.name,
      content: body.content,
      isDefault: body.isDefault ?? false,
      authorId: user.id,
    },
  })
})
