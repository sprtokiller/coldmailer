import { prisma } from '~/server/utils/prisma'
import { requireAdmin } from '~/server/utils/permissions'
import { requireAuth } from '~/server/utils/requireAuth'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ name: string; content: string; groupId: string; isTemplate?: boolean }>(event)

  if (!body.name?.trim()) throw createError({ statusCode: 400, message: 'Název podpisu je povinný' })
  if (!body.content?.trim()) throw createError({ statusCode: 400, message: 'Obsah podpisu je povinný' })
  if (!body.groupId) throw createError({ statusCode: 400, message: 'Typ projektu je povinný' })

  const isTemplate = body.isTemplate ?? false
  const user = isTemplate ? await requireAdmin(event) : await requireAuth(event)

  const group = await prisma.group.findUnique({ where: { id: body.groupId } })
  if (!group) throw createError({ statusCode: 400, message: 'Neplatný typ projektu' })

  return prisma.signature.create({
    data: {
      name: body.name.trim(),
      content: body.content,
      isTemplate,
      groupId: body.groupId,
      authorId: user.id,
    },
  })
})
