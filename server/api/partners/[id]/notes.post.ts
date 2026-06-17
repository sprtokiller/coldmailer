import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const globalRecordId = getRouterParam(event, 'id')!
  const { content } = await readBody(event)

  if (!content?.trim()) throw createError({ statusCode: 400, statusMessage: 'content required' })

  return prisma.partnerNote.create({
    data: { globalRecordId, content, authorId: user.id },
    include: { author: { select: { id: true, name: true, image: true } } },
  })
})
