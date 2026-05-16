import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const id = getRouterParam(event, 'id')!
  const body = await readBody<{ name?: string; subject?: string; body?: string }>(event)

  return prisma.emailDraft.update({
    where: { id },
    data: {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.subject !== undefined ? { subject: body.subject } : {}),
      ...(body.body !== undefined ? { body: body.body } : {}),
    },
    include: { author: { select: { id: true, name: true, image: true } } },
  })
})
