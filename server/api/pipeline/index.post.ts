import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'
import { requireProjectAccess } from '~/server/utils/permissions'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const body = await readBody<{ name: string; projectId?: string; visibility?: string; mode?: string }>(event)

  if (!body.projectId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Uživatel musí být přiřazen ke konkrétnímu projektu.',
    })
  }

  await requireProjectAccess(event, body.projectId)

  const mode = body.mode === 'short' ? 'short' : 'full'

  return prisma.pipelineRun.create({
    data: {
      name: body.name,
      mode,
      visibility: body.visibility === 'public' ? 'public' : 'private',
      authorId: user.id,
      projectId: body.projectId,
    },
    include: {
      author: { select: { id: true, name: true, image: true } },
      project: { include: { group: true } },
      steps: true,
    },
  })
})
