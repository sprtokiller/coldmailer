import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const [templates, personal] = await Promise.all([
    prisma.signature.findMany({
      where: { isSystem: true },
      include: { author: { select: { id: true, name: true, image: true } } },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.signature.findMany({
      where: { authorId: user.id, isSystem: false },
      orderBy: { createdAt: 'desc' },
    }),
  ])
  return [...templates, ...personal]
})
