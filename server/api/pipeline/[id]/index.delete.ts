import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const id = getRouterParam(event, 'id')!

  const run = await prisma.pipelineRun.findUnique({ where: { id }, select: { authorId: true } })
  if (!run) throw createError({ statusCode: 404, statusMessage: 'Pipeline nenalezena.' })
  if (run.authorId !== user.id) {
    throw createError({ statusCode: 403, statusMessage: 'Pouze autor může pipeline smazat.' })
  }

  await prisma.pipelineRun.delete({ where: { id } })

  return { ok: true }
})
