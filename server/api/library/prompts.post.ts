import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'
import { resolveLibraryScope } from '~/server/utils/libraryScope'
import { REASONING_STEP_TYPES } from '~/config/pipeline'

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

  if (!body.content.includes('<[[SCHEMA]]>')) {
    throw createError({
      statusCode: 400,
      message: 'Prompt musĂ­ obsahovat placeholder <[[SCHEMA]]> pro vloĹľenĂ­ vĂ˝stupnĂ­ho schĂ©matu.',
    })
  }

  const scope = await resolveLibraryScope(event, body)

  return prisma.systemPrompt.create({
    data: {
      name: body.name,
      content: body.content,
      stepType: body.stepType as never,
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

