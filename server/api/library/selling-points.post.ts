import { prisma } from '~/server/utils/prisma'
import { requirePermission } from '~/server/utils/permissions'
import { getActiveGroupId } from '~/server/utils/activeGroup'

export default defineEventHandler(async (event) => {
  const user = await requirePermission(event, 'selling.own.edit')
  const groupId = await getActiveGroupId(event)
  const body = await readBody<{ name: string; content: string; derivedFromId?: string }>(event)

  return prisma.sellingPoint.create({
    data: {
      name: body.name,
      content: body.content,
      authorId: user.id,
      groupId,
      derivedFromId: body.derivedFromId ?? null,
    },
    include: { author: { select: { id: true, name: true, image: true } } },
  })
})
