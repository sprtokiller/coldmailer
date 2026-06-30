import { prisma } from '~/server/utils/prisma'
import { requireAdmin } from '~/server/utils/permissions'
import { requireAuth } from '~/server/utils/requireAuth'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ name: string; content: string; isDefault?: boolean; isSystem?: boolean }>(event)

  if (!body.name || typeof body.name !== 'string' || !body.name.trim()) {
    throw createError({ statusCode: 400, message: 'NĂˇzev podpisu je povinnĂ˝' })
  }
  if (!body.content || typeof body.content !== 'string' || !body.content.trim()) {
    throw createError({ statusCode: 400, message: 'Obsah podpisu je povinnĂ˝' })
  }

  const isSystem = body.isSystem ?? false
  const isDefault = isSystem ? false : (body.isDefault ?? false)

  const user = isSystem ? await requireAdmin(event) : await requireAuth(event)

  if (isDefault) {
    await prisma.signature.updateMany({
      where: { authorId: user.id, isSystem: false, isDefault: true },
      data: { isDefault: false },
    })
  }

  return prisma.signature.create({
    data: {
      name: body.name,
      content: body.content,
      isDefault,
      isSystem,
      authorId: user.id,
    },
  })
})

