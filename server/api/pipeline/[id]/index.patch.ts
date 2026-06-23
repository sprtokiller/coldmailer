import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'

interface PatchBody {
  name?: string
  visibility?: 'public' | 'private'
}

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const id = getRouterParam(event, 'id')!
  const body = await readBody<PatchBody>(event)

  const run = await prisma.pipelineRun.findUnique({ where: { id }, select: { authorId: true } })
  if (!run) throw createError({ statusCode: 404, statusMessage: 'Pipeline nenalezena.' })
  if (run.authorId !== user.id) {
    throw createError({ statusCode: 403, statusMessage: 'Pouze autor může pipeline upravit.' })
  }

  const data: Record<string, unknown> = {}
  if (body.name !== undefined) {
    const trimmed = body.name.trim()
    if (!trimmed) throw createError({ statusCode: 400, statusMessage: 'Název nesmí být prázdný.' })
    data.name = trimmed
  }
  if (body.visibility !== undefined) {
    if (!['public', 'private'].includes(body.visibility)) {
      throw createError({ statusCode: 400, statusMessage: 'visibility musí být "public" nebo "private".' })
    }
    data.visibility = body.visibility
  }

  if (Object.keys(data).length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'Nic ke změně.' })
  }

  return prisma.pipelineRun.update({
    where: { id },
    data,
    select: { id: true, name: true, visibility: true },
  })
})
