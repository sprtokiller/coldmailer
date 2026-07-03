import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'
import { resolveLibraryScope } from '~/server/utils/libraryScope'
import { REASONING_STEP_TYPES, getMissingPlaceholders } from '~/config/pipeline'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const body = await readBody<{
    name: string
    content: string
    stepType: string
    derivedFromId?: string
    projectId?: string | null
    groupId?: string | null
  }>(event)

  if (!REASONING_STEP_TYPES.includes(body.stepType as never)) {
    throw createError({ statusCode: 400, message: 'Tento typ kroku už není podporovaný.' })
  }

  const missingPlaceholders = getMissingPlaceholders(body.stepType, body.content)
  if (missingPlaceholders.length) {
    throw createError({
      statusCode: 400,
      message: `Promptu chybí povinné placeholdery: ${missingPlaceholders.join(', ')}.`,
    })
  }

  const scope = await resolveLibraryScope(event, body)

  const maxOrder = await prisma.systemPrompt.aggregate({
    where: { stepType: body.stepType as never },
    _max: { order: true },
  })

  return prisma.systemPrompt.create({
    data: {
      name: body.name,
      content: body.content,
      stepType: body.stepType as never,
      order: (maxOrder._max.order ?? -1) + 1,
      authorId: user.id,
      ...scope,
      derivedFromId: body.derivedFromId ?? null,
    },
    include: {
      author: { select: { id: true, name: true, image: true } },
      group: true,
      project: { include: { group: true } },
    },
  })
})

